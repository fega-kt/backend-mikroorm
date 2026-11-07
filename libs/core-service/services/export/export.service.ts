import { PermissionType } from "@common/base/permission-type.enum";
import { ExportJobEntity, ExportJobStatus, ExportEmailStatus } from "@core-service/entities/export-job";
import { UserEntity } from "@core-service/entities/user";
import {
  EXPORT_INSTANT_MAX_ROWS,
  EXPORT_MAX_CONCURRENT_JOBS,
  EXPORT_MIME_XLSX,
  EXPORT_PART_ROWS,
} from "@core-service/services/export/export.constants";
import { writeExportXlsx } from "@core-service/services/export/export.file";
import type { ExportDefinition, ExportRequestSnapshot } from "@core-service/services/export/export.types";
import { contentDisposition, exportFilename, resolveColumns } from "@core-service/services/export/export.util";
import { UploadService } from "@core-service/services/upload/upload.service";
import { MikroORM } from "@mikro-orm/core";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Scope,
} from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { ExportJobListDto, PrepareExportDto } from "../../controllers/export/export.validation";
import { EXPORT_REGISTRY, type ExportRegistry } from "./export.registry";

/** Vé tải dùng một lần: người dùng phải mở link ngay sau khi chuẩn bị */
const TICKET_TTL_SECONDS = 120;
/** Khóa "đang xuất" của một người; tự hết hạn phòng khi tiến trình chết giữa chừng */
const LOCK_TTL_SECONDS = 15 * 60;

const ticketKey = (token: string) => `cache:export:ticket:${token}`;
const lockKey = (userId: string) => `cache:export:lock:${userId}`;

const ACTIVE_STATUSES = [ExportJobStatus.Queued, ExportJobStatus.Processing];

/** Bản ghi job như API trả cho người dùng (không lộ khóa file, bộ lọc, lỗi nội bộ) */
export function toJobBrief(job: ExportJobEntity) {
  return {
    id: job.id,
    resource: job.resource,
    filename: job.filename,
    status: job.status,
    total: job.total,
    processed: job.processed,
    parts: job.parts,
    size: job.size === undefined || job.size === null ? null : Number(job.size),
    error: job.error ?? null,
    sendEmail: job.sendEmail,
    emailStatus: job.emailStatus,
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    expiresAt: job.expiresAt ?? null,
    /** Tải được: đã xong, còn trong hạn lưu */
    downloadable: job.status === ExportJobStatus.Done && !!job.fileKey && (!job.expiresAt || job.expiresAt.getTime() > Date.now()),
  };
}

/**
 * Xuất Excel các danh sách của nơi chạy (sổ đăng ký được tiêm: core hoặc app). Hai chế độ theo số dòng, server tự chọn lúc `prepare`:
 * - ít dòng (< EXPORT_INSTANT_MAX_ROWS): tải ngay — vé một lần, `download` stream xlsx thẳng về trình duyệt;
 * - nhiều dòng: tạo `ExportJob`, worker của cùng nơi chạy (core-jobs / app-jobs) sinh file ở nền, đẩy lên kho private, gửi thông báo khi xong.
 * Điều kiện lọc và quyền thấy dữ liệu nằm trong định nghĩa, dùng đúng hàm của danh sách.
 */
@Injectable({ scope: Scope.REQUEST })
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    private readonly orm: MikroORM,
    private readonly upload: UploadService,
    @Inject(EXPORT_REGISTRY) private readonly registry: ExportRegistry,
  ) {}

  private currentUser() {
    const user = this.request.user;
    if (!user) throw new ForbiddenException("Not signed in");
    return user;
  }

  async prepare(resource: string, data: PrepareExportDto) {
    const user = this.currentUser();
    const definition = this.definitionOf(resource);
    if (!definition.permissions.every((permission: PermissionType) => user.canAccess([permission]))) {
      throw new ForbiddenException("You cannot export this list");
    }

    const parsed = definition.filterSchema.safeParse(data.filter);
    if (!parsed.success) {
      throw new BadRequestException({ code: "INVALID_FILTER", message: parsed.error.issues.map((issue) => issue.message).join("; ") });
    }
    try {
      resolveColumns(definition.columns, data.columns, data.lang);
    } catch (error) {
      throw new BadRequestException({ code: "INVALID_COLUMNS", message: error instanceof Error ? error.message : "Invalid columns" });
    }

    // Quyền riêng của danh sách (vd: xem toàn hệ thống hay một phòng ban) chốt tại đây, vì worker không có quyền của người dùng
    const scope = definition.resolveScope?.(user, parsed.data);
    const cutoff = new Date();
    const em = this.orm.em.fork();
    const total = await (await definition.open(em, data.filter, user.id, cutoff, scope)).count();
    if (!total) throw new BadRequestException({ code: "NO_DATA", message: "There is no data to export" });

    const filename = exportFilename(definition.title[data.lang], cutoff, total > EXPORT_PART_ROWS ? "zip" : "xlsx");
    const snapshot: ExportRequestSnapshot = {
      resource,
      userId: user.id,
      // Bộ lọc GỐC: định nghĩa tự parse đúng một lần khi mở (parse lại giá trị đã chuyển đổi sẽ lỗi, vd statuses)
      filter: data.filter,
      scope,
      columns: data.columns,
      lang: data.lang,
      cutoff: cutoff.toISOString(),
      filename,
      total,
    };

    if (total < EXPORT_INSTANT_MAX_ROWS) {
      const token = randomBytes(24).toString("base64url");
      await this.cache.set(ticketKey(token), snapshot, TICKET_TTL_SECONDS);
      return { mode: "download" as const, downloadPath: `/export/download/${token}`, filename, count: total };
    }

    // Nhiều dòng: chạy nền. Mỗi người một job đang chờ / chạy để không dồn việc nặng
    const active = await em.count(ExportJobEntity, { user: user.id, status: { $in: ACTIVE_STATUSES }, deleted: { $ne: true } });
    if (active) throw new ConflictException({ code: "EXPORT_JOB_ACTIVE", message: "You already have an export running in the background" });
    const owner = em.getReference(UserEntity, user.id);
    const job = em.create(ExportJobEntity, {
      user: owner,
      resource,
      filter: data.filter,
      scope,
      columns: data.columns,
      lang: data.lang,
      cutoff,
      filename,
      total,
      sendEmail: data.sendEmail,
      emailStatus: data.sendEmail ? ExportEmailStatus.Pending : ExportEmailStatus.None,
      createdBy: owner,
      updatedBy: owner,
    });
    await em.flush();
    return { mode: "queued" as const, jobId: job.id, filename, count: total };
  }

  /** Stream xlsx theo vé; vé chỉ dùng một lần và mỗi người chỉ chạy một lượt tải ngay cùng lúc */
  async download(token: string, res: Response) {
    const snapshot = await this.takeTicket(token);
    if (await this.cache.get(lockKey(snapshot.userId))) {
      throw new ConflictException({ code: "EXPORT_IN_PROGRESS", message: "Another export is still running" });
    }
    await this.cache.set(lockKey(snapshot.userId), "1", LOCK_TTL_SECONDS);

    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) abort.abort();
    });
    const started = Date.now();
    try {
      const definition = this.definitionOf(snapshot.resource);
      res.status(200);
      res.setHeader("Content-Type", EXPORT_MIME_XLSX);
      res.setHeader("Content-Disposition", contentDisposition(snapshot.filename));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      const rows = await writeExportXlsx(definition, snapshot, this.orm.em.fork(), res, abort.signal);
      this.logger.log(`export ${snapshot.resource} by ${snapshot.userId}: ${rows} rows in ${Date.now() - started}ms`);
    } catch (error) {
      if (!abort.signal.aborted) {
        this.logger.error(
          `export ${snapshot.resource} by ${snapshot.userId} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      res.destroy(error instanceof Error ? error : undefined);
    } finally {
      await this.cache.del(lockKey(snapshot.userId));
    }
  }

  /** Lịch sử xuất chạy nền của chính người dùng, mới nhất trước */
  async listJobs({ page, limit }: ExportJobListDto) {
    const user = this.currentUser();
    const [jobs, total] = await this.orm.em
      .fork()
      .findAndCount(
        ExportJobEntity,
        { user: user.id, deleted: { $ne: true } },
        { orderBy: { createdAt: "DESC", id: "DESC" }, limit, offset: (page - 1) * limit },
      );
    return { data: jobs.map(toJobBrief), total, page, limit };
  }

  /** Hủy job của mình: đang chờ thì hủy luôn, đang chạy thì báo worker dừng ở lô kế tiếp */
  async cancelJob(id: string) {
    const user = this.currentUser();
    const em = this.orm.em.fork();
    const now = new Date();
    const cancelled = await em.nativeUpdate(
      ExportJobEntity,
      { id, user: user.id, status: ExportJobStatus.Queued },
      { status: ExportJobStatus.Cancelled, finishedAt: now, updatedAt: now },
    );
    if (cancelled) return { cancelled: true };
    const requested = await em.nativeUpdate(
      ExportJobEntity,
      { id, user: user.id, status: ExportJobStatus.Processing },
      { cancelRequested: true, updatedAt: now },
    );
    if (!requested) throw new NotFoundException("No active export with this id");
    return { cancelled: false };
  }

  /** Link tải ngắn hạn của file đã xong — chỉ chủ job; ký thẳng tới kho nên trình duyệt tải không qua backend */
  async jobDownload(id: string) {
    const user = this.currentUser();
    const job = await this.orm.em.fork().findOne(ExportJobEntity, { id, user: user.id, deleted: { $ne: true } });
    if (!job) throw new NotFoundException("Export not found");
    if (!toJobBrief(job).downloadable || !job.fileKey) {
      throw new ConflictException({ code: "EXPORT_NOT_AVAILABLE", message: "The file is not ready or has expired" });
    }
    const { url, expiresAt } = await this.upload.createDownloadUrl(job.fileKey, job.filename);
    return { url, expiresAt, filename: job.filename };
  }

  private definitionOf(resource: string): ExportDefinition<never> {
    const definition = this.registry.get(resource);
    if (!definition) throw new NotFoundException("Unknown export resource");
    return definition;
  }

  private async takeTicket(token: string): Promise<ExportRequestSnapshot> {
    const key = ticketKey(token);
    const snapshot = await this.cache.get<ExportRequestSnapshot>(key);
    if (!snapshot) throw new NotFoundException("Download link is invalid or expired");
    await this.cache.del(key);
    return snapshot;
  }
}

/** Số job chạy cùng lúc tối đa (worker đọc lại để không vượt) */
export const MAX_CONCURRENT_EXPORT_JOBS = EXPORT_MAX_CONCURRENT_JOBS;
