import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { AttachmentEntity, AttachmentPreviewStatus, AttachmentStatus, AttachmentVisibility } from "@core-service/entities/attachment";
import { UserEntity } from "@core-service/entities/user";
import { isConvertibleToPdf, isPdf, OfficeConverter, pdfFilenameOf } from "@core-service/services/e-signature";
import { FileContextType } from "@core-service/services/file-view/file-access-policy";
import { UploadService } from "@core-service/services/upload/upload.service";
import { EntityManager, LockMode, MikroORM } from "@mikro-orm/core";
import { Injectable, Logger } from "@nestjs/common";
import { ApprovalHistoryAction, ApprovalHistoryEntity } from "../../entities/approval-history";
import { ApprovalRequestEntity, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalRequestFileEntity, RequestFileConvertStatus } from "../../entities/approval-request-file";
import { buildSignedFileFolder, RequestFileCategory } from "../approval-request/request-file.constants";
import { loadRequestFiles } from "../approval-request/request-files";

const PDF_MIME = "application/pdf";
/** Job chuyển ở nền: thử lại sau 15, 15, 60 phút; hết lượt thì để người duyệt mở hộp ký chuyển lại */
export const CONVERT_RETRY_DELAYS_MIN = [15, 15, 60];
export const CONVERT_MAX_ATTEMPTS = CONVERT_RETRY_DELAYS_MIN.length;

const fileRef = (f: AttachmentEntity) => ({ id: f.id, filename: f.filename });
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Văn bản (bản hiện tại) là Word / Excel / PowerPoint chưa có bản PDF */
export const needsConversion = (row: ApprovalRequestFileEntity) => !isPdf(row.current.filename) && isConvertibleToPdf(row.current.filename);

interface Actor {
  /** null → hệ thống (job ở nền) */
  userId: string | null;
  node?: { id: string; name?: string };
}

/**
 * Bản PDF của văn bản tờ trình trong một vòng: lưu vào Attachments/{requestId}/round-{n}/signed và chuyển
 * Word / Excel / PowerPoint sang PDF. Dùng chung cho hộp "Ký và duyệt" (chạy trong khóa của engine, lỗi thì báo lỗi)
 * và job chuyển sẵn ở nền khi tờ trình tới bước ký (lỗi thì hẹn thử lại). Singleton: app và app-jobs dùng chung.
 */
@Injectable()
export class RequestPdfService {
  private readonly logger = new Logger(RequestPdfService.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly converter: OfficeConverter,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * Lưu một bản PDF vào thư mục của vòng: bản chuyển đổi là {tên}.pdf, bản ký là {taskId}-{tên}.pdf (trùng thì thêm -2…).
   * Tên hiển thị vẫn là tên văn bản. Key vừa tải lên được thêm vào uploadedKeys để caller xóa nếu transaction lỗi.
   */
  async storePdf(
    em: EntityManager,
    request: ApprovalRequestEntity,
    keyName: string,
    filename: string,
    content: Buffer,
    uploadedKeys: string[],
    actorId: string | null,
  ) {
    const folder = buildSignedFileFolder(request.id, request.round, request.createdAt);
    const key = await this.uploadService.putPrivateObjectUnique(folder, keyName, content, PDF_MIME);
    uploadedKeys.push(key);
    return this.pdfAttachment(em, request, { key, folder, filename, size: content.length }, actorId);
  }

  /**
   * Chuyển ngay (trong transaction của caller) mọi văn bản của vòng còn là Word / Excel / PowerPoint — dùng ở hộp ký.
   * Lỗi ở văn bản nào thì ném lỗi luôn (caller rollback, xóa các key đã tải lên).
   */
  async convertDocuments(
    em: EntityManager,
    request: ApprovalRequestEntity,
    rows: ApprovalRequestFileEntity[],
    actor: Actor,
    uploadedKeys: string[],
  ) {
    const converted = [];
    for (const row of rows.filter(needsConversion)) {
      const name = pdfFilenameOf(row.original.filename);
      const copy = await this.storePdf(em, request, name, name, await this.converter.toPdf(row.current), uploadedKeys, actor.userId);
      converted.push({ from: fileRef(row.current), to: fileRef(copy) });
      this.markConverted(row, copy);
    }
    this.recordConversion(em, request, converted, actor);
    return converted;
  }

  /**
   * Job ở nền: chuyển các văn bản đang chờ (đến hạn) của một tờ trình. Gọi Document Converter và tải PDF lên R2
   * NGOÀI transaction (không giữ khóa tờ trình trong lúc chờ chuyển), rồi khóa tờ trình để gắn kết quả —
   * văn bản đã được người duyệt chuyển trước (qua hộp ký) thì bỏ bản vừa tạo. Lỗi thì hẹn thử lại.
   */
  async processRequest(requestId: string): Promise<{ converted: number; failed: number }> {
    const em = this.orm.em.fork();
    const request = await em.findOne(ApprovalRequestEntity, {
      id: requestId,
      status: ApprovalRequestStatus.Pending,
      deleted: { $ne: true },
    });
    if (!request) return { converted: 0, failed: 0 };

    const now = new Date();
    const due = (await loadRequestFiles(em, request.id, request.round, RequestFileCategory.Documents)).filter(
      (row) =>
        row.convertStatus === RequestFileConvertStatus.Pending && needsConversion(row) && (!row.convertNextAt || row.convertNextAt <= now),
    );
    if (!due.length) return { converted: 0, failed: 0 };

    const results = new Map<string, { key: string; folder: string; filename: string; size: number }>();
    const failures = new Map<string, string>();
    for (const row of due) {
      try {
        const pdf = await this.converter.toPdf(row.current);
        const filename = pdfFilenameOf(row.original.filename);
        const folder = buildSignedFileFolder(request.id, request.round, request.createdAt);
        const key = await this.uploadService.putPrivateObjectUnique(folder, filename, pdf, PDF_MIME);
        results.set(row.id, { key, folder, filename, size: pdf.length });
      } catch (err) {
        failures.set(row.id, errorMessage(err));
      }
    }

    const orphanKeys: string[] = [];
    let converted = 0;
    try {
      await this.orm.em.fork().transactional(async (tx) => {
        const locked = await tx.findOne(ApprovalRequestEntity, { id: request.id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        const rows = await tx.find(ApprovalRequestFileEntity, { id: { $in: due.map((r) => r.id) } }, { populate: ["original", "current"] });
        const changes = [];
        for (const row of rows) {
          const result = results.get(row.id);
          // Tờ trình đã sang vòng khác / văn bản đã có PDF (người duyệt chuyển trước): bỏ bản vừa tạo
          const stillNeeded = locked?.round === row.round && needsConversion(row);
          if (result && !stillNeeded) {
            orphanKeys.push(result.key);
            continue;
          }
          if (result && locked) {
            const copy = this.pdfAttachment(tx, locked, result, null);
            changes.push({ from: fileRef(row.current), to: fileRef(copy) });
            this.markConverted(row, copy);
            continue;
          }
          const error = failures.get(row.id);
          if (error && stillNeeded) this.markFailedAttempt(row, error, now);
        }
        if (locked)
          this.recordConversion(tx, locked, changes, {
            userId: null,
            node: locked.currentNodeIds[0] ? { id: locked.currentNodeIds[0] } : undefined,
          });
        converted = changes.length;
      });
    } catch (err) {
      // Không gắn được kết quả: xóa mọi bản PDF vừa tải lên, lượt sau làm lại
      orphanKeys.push(...[...results.values()].map((r) => r.key));
      throw err;
    } finally {
      await Promise.all(orphanKeys.map((key) => this.uploadService.deleteObject(key).catch(() => undefined)));
    }
    if (failures.size) this.logger.warn(`Converting documents of request ${requestId} failed for ${failures.size} file(s)`);
    return { converted, failed: failures.size };
  }

  /** Tờ trình (đang chờ duyệt) có văn bản chờ chuyển đã đến hạn — cho cron thử lại / làm bù */
  async dueRequestIds(limit: number): Promise<string[]> {
    const rows = await this.orm.em.fork().find(
      ApprovalRequestFileEntity,
      {
        convertStatus: RequestFileConvertStatus.Pending,
        convertNextAt: { $lte: new Date() },
        request: { status: ApprovalRequestStatus.Pending, deleted: { $ne: true } },
      },
      { fields: ["request"], orderBy: { convertNextAt: "ASC" }, limit },
    );
    return [...new Set(rows.map((row) => row.request.id))];
  }

  /* ================= HELPERS ================= */

  private pdfAttachment(
    em: EntityManager,
    request: ApprovalRequestEntity,
    file: { key: string; folder: string; filename: string; size: number },
    actorId: string | null,
  ) {
    const actor = em.getReference(UserEntity, actorId ?? SYSTEM_USER_ID);
    return em.create(AttachmentEntity, {
      filename: file.filename,
      mimetype: PDF_MIME,
      size: file.size,
      key: file.key,
      url: "",
      visibility: AttachmentVisibility.Private,
      status: AttachmentStatus.Ready,
      storagePath: file.folder,
      contextType: FileContextType.ApprovalRequest,
      refId: request.id,
      // PDF đã ký không được viết lại (sẽ hỏng chữ ký) → không tạo bản xem; bản chuyển đổi để ký cũng vậy
      previewStatus: AttachmentPreviewStatus.Skipped,
      createdBy: actor,
      updatedBy: actor,
    });
  }

  private markConverted(row: ApprovalRequestFileEntity, copy: AttachmentEntity) {
    Object.assign(row, {
      current: copy,
      convertStatus: RequestFileConvertStatus.Done,
      convertNextAt: undefined,
      convertError: undefined,
      updatedAt: new Date(),
    });
  }

  private markFailedAttempt(row: ApprovalRequestFileEntity, error: string, now: Date) {
    const attempts = row.convertAttempts + 1;
    const exhausted = attempts >= CONVERT_MAX_ATTEMPTS;
    Object.assign(row, {
      convertAttempts: attempts,
      convertStatus: exhausted ? RequestFileConvertStatus.Failed : RequestFileConvertStatus.Pending,
      convertNextAt: exhausted ? undefined : new Date(now.getTime() + CONVERT_RETRY_DELAYS_MIN[attempts - 1] * 60_000),
      convertError: error.slice(0, 1000),
      updatedAt: now,
    });
  }

  /** Dòng lịch sử "chuyển văn bản sang PDF" (người duyệt mở hộp ký, hoặc hệ thống chuyển sẵn) */
  private recordConversion(em: EntityManager, request: ApprovalRequestEntity, files: { from: unknown; to: unknown }[], actor: Actor) {
    if (!files.length) return;
    const ref = em.getReference(UserEntity, actor.userId ?? SYSTEM_USER_ID);
    em.create(ApprovalHistoryEntity, {
      request,
      action: ApprovalHistoryAction.FileConvert,
      actor: actor.userId ? ref : undefined,
      nodeId: actor.node?.id,
      nodeName: actor.node?.name,
      data: { round: request.round, files },
      createdBy: ref,
      updatedBy: ref,
    });
  }
}
