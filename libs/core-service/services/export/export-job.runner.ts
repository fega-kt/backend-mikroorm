import { STORAGE_PATH } from "@common/constants/storage.constant";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { FrontendPath, frontendUrl } from "@common/constants/frontend-path.constant";
import { parseValueBoolean } from "@common/utils/parse-value.util";
import { ENV } from "@config/env.config";
import { AppSettingEntity, AppSettingType } from "@core-service/entities/app-setting";
import { ExportEmailStatus, ExportJobEntity, ExportJobStatus } from "@core-service/entities/export-job";
import { NotificationEntity, NotificationType } from "@core-service/entities/notification";
import { UserEntity } from "@core-service/entities/user";
import { CoreEmailTemplate, renderCoreEmail } from "@core-service/services/email-template/core-email.templates";
import {
  EXPORT_EMAIL_ATTACH_MAX_BYTES,
  EXPORT_HEARTBEAT_INTERVAL_MS,
  EXPORT_JOB_TIMEOUT_MS,
  EXPORT_MAX_CONCURRENT_JOBS,
  EXPORT_PROGRESS_EVERY_BATCHES,
  EXPORT_RETENTION_DAYS,
  EXPORT_STALE_HEARTBEAT_MS,
} from "@core-service/services/export/export.constants";
import { writeExportFile } from "@core-service/services/export/export.file";
import type { ExportDefinition, ExportRequestSnapshot } from "@core-service/services/export/export.types";
import type { ExportLang } from "@core-service/services/export/export.util";
import { UploadService } from "@core-service/services/upload/upload.service";
import { EntityManager, MikroORM } from "@mikro-orm/core";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Resend } from "resend";
import { recipientAddress } from "../email-template/recipient-address";
import { EXPORT_REGISTRY, type ExportRegistry } from "./export.registry";

/** Lý do lỗi lưu ở job (mã ngắn — không lộ chi tiết nội bộ); frontend dịch theo mã, email dùng bản tiếng Việt dưới đây */
export enum ExportJobError {
  Timeout = "TIMEOUT",
  WorkerLost = "WORKER_LOST",
  UnknownResource = "UNKNOWN_RESOURCE",
  Failed = "FAILED",
}

const ERROR_TEXT: Record<ExportJobError, string> = {
  [ExportJobError.Timeout]: "Quá thời gian xử lý cho phép",
  [ExportJobError.WorkerLost]: "Tiến trình xử lý bị gián đoạn",
  [ExportJobError.UnknownResource]: "Danh sách không còn hỗ trợ xuất",
  [ExportJobError.Failed]: "Có lỗi khi tạo file, vui lòng thử lại",
};

/** Ném để dừng giữa chừng: người dùng hủy */
class ExportCancelled extends Error {}
/** Ném để dừng giữa chừng với một lý do đã biết */
class ExportStopped extends Error {
  constructor(readonly code: ExportJobError) {
    super(code);
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Chạy các lượt xuất Excel nền. Bảng `export_jobs` là hàng đợi:
 * - `claimNext`: nhận một job `queued` bằng khóa `FOR UPDATE SKIP LOCKED`, kiểm số job đang chạy trong cùng câu lệnh
 *   (nhiều worker không nhận trùng, không vượt trần song song);
 * - `process`: sinh file ra thư mục tạm → đẩy lên kho private → ghi kết quả → thông báo / email → luôn xóa file tạm;
 * - `sweep`: job treo (không báo còn sống) thành lỗi, file hết hạn bị xóa.
 */
@Injectable()
export class ExportJobRunner {
  private readonly logger = new Logger(ExportJobRunner.name);
  private readonly resend = ENV.RESEND_API_KEY ? new Resend(ENV.RESEND_API_KEY) : null;

  constructor(
    private readonly orm: MikroORM,
    private readonly upload: UploadService,
    @Inject(EXPORT_REGISTRY) private readonly registry: ExportRegistry,
  ) {}

  /** Tra định nghĩa xuất theo khóa — tách ra để test thay được */
  protected definitionOf(resource: string): ExportDefinition<never> | undefined {
    return this.registry.get(resource);
  }

  /** Gửi một email — tách ra để test thay được. Trả về nếu gửi xong, ném lỗi nếu không */
  protected async sendMail(message: { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }) {
    if (!this.resend) throw new Error("RESEND_API_KEY not configured");
    const { error } = await this.resend.emails.send({ from: ENV.MAIL_FROM, ...message });
    if (error) throw new Error(error.message);
  }

  /** Nhận job kế tiếp nếu còn chỗ chạy; trả về id job đã chuyển sang `processing`, hoặc null */
  async claimNext(): Promise<string | null> {
    const resources = this.registry.resources();
    if (!resources.length) return null;
    const em = this.orm.em.fork();
    const meta = em.getMetadata().get(ExportJobEntity.name);
    const schema = meta.schema ?? em.config.get("schema");
    const table = schema ? `"${schema}"."${meta.tableName}"` : `"${meta.tableName}"`;
    const rows = await em.getConnection().execute<{ id: string }[]>(
      `update ${table} set "status" = 'processing', "started_at" = now(), "heartbeat_at" = now(), "updated_at" = now()
       where "id" = (select "id" from ${table} where "status" = 'queued' and "deleted" = false and "cancel_requested" = false and "resource" in (?) order by "created_at" limit 1 for update skip locked)
         and (select count(*) from ${table} where "status" = 'processing' and "deleted" = false and "resource" in (?)) < ?
       returning "id"`,
      [resources, resources, EXPORT_MAX_CONCURRENT_JOBS],
    );
    return rows[0]?.id ?? null;
  }

  async process(jobId: string): Promise<void> {
    const em = this.orm.em.fork();
    const job = await em.findOne(ExportJobEntity, { id: jobId }, { populate: ["user"] });
    if (job?.status !== ExportJobStatus.Processing) return;

    const definition = this.definitionOf(job.resource);
    if (!definition) return this.fail(em, job, ExportJobError.UnknownResource);

    const snapshot: ExportRequestSnapshot = {
      resource: job.resource,
      userId: job.user.id,
      filter: job.filter,
      scope: job.scope,
      columns: job.columns,
      lang: job.lang as ExportLang,
      cutoff: job.cutoff.toISOString(),
      filename: job.filename,
      total: job.total,
    };
    const started = Date.now();
    const dir = await mkdtemp(path.join(os.tmpdir(), `export-${job.id}-`));
    let uploadedKey: string | undefined;
    // Báo còn sống đều đặn, kể cả những lúc không có lô nào (đóng zip, tải file lớn lên kho, gửi email): nếu không, một worker khác
    // sẽ coi job là treo, đánh dấu lỗi rồi job của mình lại ghi "xong"
    const heartbeat = setInterval(() => {
      const now = new Date();
      void this.orm.em
        .fork()
        .nativeUpdate(ExportJobEntity, { id: jobId, status: ExportJobStatus.Processing }, { heartbeatAt: now, updatedAt: now })
        .catch(() => undefined);
    }, EXPORT_HEARTBEAT_INTERVAL_MS);
    try {
      let batches = 0;
      const result = await writeExportFile({
        definition,
        snapshot,
        em: this.orm.em.fork(),
        dir,
        // Sau mỗi vài lô: báo còn sống + tiến độ, kiểm hủy và quá hạn (ném lỗi để dừng)
        onProgress: async (rows) => {
          if (++batches % EXPORT_PROGRESS_EVERY_BATCHES !== 0) return;
          if (Date.now() - started > EXPORT_JOB_TIMEOUT_MS) throw new ExportStopped(ExportJobError.Timeout);
          const now = new Date();
          const state = await this.orm.em.fork().findOne(ExportJobEntity, { id: jobId }, { fields: ["cancelRequested"] });
          if (state?.cancelRequested) throw new ExportCancelled();
          await this.orm.em.fork().nativeUpdate(ExportJobEntity, { id: jobId }, { processed: rows, heartbeatAt: now, updatedAt: now });
        },
      });

      // Người dùng bấm hủy ngay lúc file vừa xong: không đẩy lên kho
      const latest = await this.orm.em.fork().findOne(ExportJobEntity, { id: jobId }, { fields: ["cancelRequested"] });
      if (latest?.cancelRequested) throw new ExportCancelled();

      uploadedKey = this.upload.newUniquePrivateKey(`${STORAGE_PATH.EXPORTS}/${job.user.id}/${job.id}`, job.filename);
      await this.upload.putPrivateObjectStream(uploadedKey, createReadStream(result.path), result.size, result.mimetype);

      // File nhỏ thì đính kèm email: đọc trước khi xóa thư mục tạm
      const attachment =
        job.sendEmail && result.size <= EXPORT_EMAIL_ATTACH_MAX_BYTES
          ? { filename: job.filename, content: await readFile(result.path) }
          : undefined;

      const now = new Date();
      const finished = await this.orm.em.fork().nativeUpdate(
        ExportJobEntity,
        { id: jobId, status: ExportJobStatus.Processing },
        {
          status: ExportJobStatus.Done,
          fileKey: uploadedKey,
          size: String(result.size),
          parts: result.parts,
          processed: result.rows,
          finishedAt: now,
          heartbeatAt: now,
          expiresAt: new Date(now.getTime() + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
          updatedAt: now,
        },
      );
      // Job đã bị đánh dấu khác khi đang chạy (treo bị dọn, hủy…): bỏ file vừa tải lên, không báo "xong"
      if (!finished) {
        await this.upload.deleteObject(uploadedKey).catch(() => undefined);
        uploadedKey = undefined;
        this.logger.warn(`export job ${jobId} was no longer processing when it finished; result discarded`);
        return;
      }
      this.logger.log(
        `export job ${jobId} (${job.resource}) done: ${result.rows} rows, ${result.parts} part(s), ${result.size} bytes in ${Date.now() - started}ms`,
      );
      await this.notifyDone(this.orm.em.fork(), jobId, result.rows, attachment);
    } catch (error) {
      if (uploadedKey) await this.upload.deleteObject(uploadedKey).catch(() => undefined);
      if (error instanceof ExportCancelled) {
        const now = new Date();
        await this.orm.em
          .fork()
          .nativeUpdate(
            ExportJobEntity,
            { id: jobId, status: ExportJobStatus.Processing },
            { status: ExportJobStatus.Cancelled, finishedAt: now, updatedAt: now },
          );
        this.logger.log(`export job ${jobId} cancelled`);
      } else {
        const code = error instanceof ExportStopped ? error.code : ExportJobError.Failed;
        if (!(error instanceof ExportStopped)) this.logger.error(`export job ${jobId} failed: ${errorMessage(error)}`);
        await this.fail(this.orm.em.fork(), job, code);
      }
    } finally {
      clearInterval(heartbeat);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Job treo → lỗi (kèm thông báo); file hết hạn → xóa khỏi kho và đánh dấu hết hạn */
  async sweep(): Promise<void> {
    const now = new Date();
    const em = this.orm.em.fork();
    const stale = await em.find(
      ExportJobEntity,
      {
        resource: { $in: this.registry.resources() },
        status: ExportJobStatus.Processing,
        heartbeatAt: { $lt: new Date(now.getTime() - EXPORT_STALE_HEARTBEAT_MS) },
        deleted: { $ne: true },
      },
      { populate: ["user"], limit: 20 },
    );
    for (const job of stale) {
      this.logger.warn(`export job ${job.id} lost its worker`);
      await this.fail(this.orm.em.fork(), job, ExportJobError.WorkerLost);
    }

    const expired = await em.find(
      ExportJobEntity,
      { resource: { $in: this.registry.resources() }, status: ExportJobStatus.Done, expiresAt: { $lt: now }, deleted: { $ne: true } },
      { limit: 50 },
    );
    for (const job of expired) {
      if (job.fileKey)
        await this.upload
          .deleteObject(job.fileKey)
          .catch((error) => this.logger.warn(`delete ${job.fileKey} failed: ${errorMessage(error)}`));
      await this.orm.em
        .fork()
        .nativeUpdate(ExportJobEntity, { id: job.id }, { status: ExportJobStatus.Expired, fileKey: null, updatedAt: now });
    }
  }

  private async fail(em: EntityManager, job: ExportJobEntity, code: ExportJobError) {
    const now = new Date();
    // Chỉ khi job còn đang chạy: job đã xong / bị hủy / bị dọn rồi thì không đổi và không báo lại
    const updated = await em.nativeUpdate(
      ExportJobEntity,
      { id: job.id, status: ExportJobStatus.Processing },
      { status: ExportJobStatus.Failed, error: code, finishedAt: now, updatedAt: now },
    );
    if (!updated) return;
    await this.notify(this.orm.em.fork(), job.id, "failed", { error: code });
  }

  private async notifyDone(em: EntityManager, jobId: string, rows: number, attachment?: { filename: string; content: Buffer }) {
    await this.notify(em, jobId, "ready", { rows, attachment });
  }

  /** Thông báo trong ứng dụng + (nếu người dùng chọn) email tới chính người yêu cầu; lỗi ở đây không làm hỏng job đã xong */
  private async notify(
    em: EntityManager,
    jobId: string,
    kind: "ready" | "failed",
    extra: { rows?: number; error?: ExportJobError; attachment?: { filename: string; content: Buffer } },
  ) {
    try {
      const job = await em.findOne(ExportJobEntity, { id: jobId }, { populate: ["user"] });
      if (!job) return;
      const system = em.getReference(UserEntity, SYSTEM_USER_ID);
      em.create(NotificationEntity, {
        user: job.user,
        type: kind === "ready" ? NotificationType.EXPORT_READY : NotificationType.EXPORT_FAILED,
        data: { name: job.filename, count: extra.rows ?? job.total },
        refId: job.id,
        refType: "export_jobs",
        isRead: false,
        createdBy: system,
        updatedBy: system,
      });
      await em.flush();
      if (job.sendEmail) await this.email(em, job, kind, extra);
    } catch (error) {
      this.logger.error(`export job ${jobId}: notifying failed: ${errorMessage(error)}`);
    }
  }

  private async email(
    em: EntityManager,
    job: ExportJobEntity,
    kind: "ready" | "failed",
    extra: { rows?: number; error?: ExportJobError; attachment?: { filename: string; content: Buffer } },
  ) {
    const setEmailStatus = (status: ExportEmailStatus, error?: string) =>
      this.orm.em
        .fork()
        .nativeUpdate(ExportJobEntity, { id: job.id }, { emailStatus: status, emailError: error ?? null, updatedAt: new Date() });
    try {
      const setting = await em.findOne(
        AppSettingEntity,
        { key: AppSettingType.WORK_EMAIL_FALLBACK_TO_LOGIN_NAME, deleted: { $ne: true } },
        { fields: ["value"] },
      );
      // Chỉ gửi tới địa chỉ của chính người yêu cầu — file có thể chứa dữ liệu nội bộ
      const to = recipientAddress(job.user, parseValueBoolean(setting?.value));
      if (!to) {
        await setEmailStatus(ExportEmailStatus.Failed, "Recipient has no email address");
        return;
      }

      const attached = kind === "ready" && !!extra.attachment;
      const content = await renderCoreEmail(em, kind === "ready" ? CoreEmailTemplate.ExportReady : CoreEmailTemplate.ExportFailed, {
        "user.name": job.user.fullName,
        "user.email": job.user.loginName,
        "export.name": job.filename,
        "export.rows": (extra.rows ?? job.total).toLocaleString("vi-VN"),
        "export.expireDays": String(EXPORT_RETENTION_DAYS),
        "export.note": attached ? "File được đính kèm trong email này." : "File quá lớn để đính kèm, vui lòng tải trong hệ thống.",
        "export.error": ERROR_TEXT[extra.error ?? ExportJobError.Failed],
        "export.link": frontendUrl(FrontendPath.ExportHistory),
      });
      await this.sendMail({ to, ...content, attachments: attached ? [extra.attachment] : undefined });
      await setEmailStatus(ExportEmailStatus.Sent);
    } catch (error) {
      this.logger.error(`export job ${job.id}: sending email failed: ${errorMessage(error)}`);
      await setEmailStatus(ExportEmailStatus.Failed, errorMessage(error).slice(0, 500));
    }
  }
}
