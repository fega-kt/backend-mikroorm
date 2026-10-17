import { describeError } from "@common/utils/describe-error.util";
import { FilterQuery, MikroORM } from "@mikro-orm/core";
import { Injectable, Logger } from "@nestjs/common";
import { AttachmentEntity, AttachmentPreviewStatus, AttachmentStatus, AttachmentVisibility } from "../../entities/attachment";
import { previewKeyOf } from "../upload/upload.constants";
import { UploadService } from "../upload/upload.service";
import { inspectPdfBytes, optimizePdf, PdfProtectedError, previewSkipReason } from "./pdf-preview.util";

const PDF_MIME = "application/pdf";

/** Tệp PDF private đã upload xong: đối tượng tạo bản xem */
export const PDF_PREVIEW_CANDIDATE: FilterQuery<AttachmentEntity> = {
  deleted: { $ne: true },
  status: AttachmentStatus.Ready,
  visibility: AttachmentVisibility.Private,
  $or: [{ mimetype: PDF_MIME }, { filename: { $ilike: "%.pdf" } }],
};

/** Số lần xử lý lỗi tối đa: đủ thì đánh dấu failed, không thử nữa */
export const PDF_PREVIEW_MAX_ATTEMPTS = 3;

/**
 * Thời gian chờ (phút) trước khi cron chạy bù nhặt một tệp pending, theo số lần đã lỗi (previewAttempts):
 * 0 = chưa lỗi lần nào (mất message / job chết giữa chừng / PDF cũ), 1 = sau lần lỗi đầu, 2 = sau lần lỗi thứ hai
 */
export const PDF_PREVIEW_RETRY_DELAY_MINUTES = [15, 15, 60];

/** Tệp pending đã chờ đủ lâu theo số lần lỗi: đến lượt cron chạy bù xử lý */
export function pdfPreviewDueFilter(now = Date.now()): FilterQuery<AttachmentEntity> {
  return {
    $and: [
      PDF_PREVIEW_CANDIDATE,
      {
        previewStatus: AttachmentPreviewStatus.Pending,
        $or: PDF_PREVIEW_RETRY_DELAY_MINUTES.map((minutes, attempts) => ({
          previewAttempts: attempts,
          updatedAt: { $lt: new Date(now - minutes * 60 * 1000) },
        })),
      },
    ],
  };
}

export function isPdfAttachment(file: Pick<AttachmentEntity, "mimetype" | "filename">) {
  return file.mimetype === PDF_MIME || file.filename.toLowerCase().endsWith(".pdf");
}

/**
 * Tạo bản xem cho PDF private: tệp gốc giữ nguyên, bản xem (sắp xếp lại object) lưu ở folder Previews.
 * Bỏ qua tệp mã hóa / ký số và tệp đã gọn sẵn. Lỗi thì thử lại (giãn dần) tối đa PDF_PREVIEW_MAX_ATTEMPTS lần rồi đánh dấu failed;
 * trong lúc đó trình xem dùng tệp gốc.
 */
@Injectable()
export class AttachmentPreviewService {
  private readonly logger = new Logger(AttachmentPreviewService.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly uploadService: UploadService,
  ) {}

  /** Xử lý một tệp pending; tệp không phải PDF / không ở trạng thái chờ thì bỏ qua. Trả về trạng thái sau khi xử lý */
  async process(attachmentId: string): Promise<AttachmentPreviewStatus | undefined> {
    const em = this.orm.em.fork();
    const file = await em.findOne(AttachmentEntity, { id: attachmentId });
    if (
      !file ||
      file.deleted ||
      file.status !== AttachmentStatus.Ready ||
      file.visibility !== AttachmentVisibility.Private ||
      !isPdfAttachment(file)
    ) {
      return undefined;
    }
    if (file.previewStatus !== AttachmentPreviewStatus.Pending) return file.previewStatus;

    const startedAt = performance.now();
    const tag = `attachment=${file.id} key=${file.key} size=${file.size}`;
    try {
      const bytes = await this.uploadService.getObjectBuffer(file.key);
      const inspection = inspectPdfBytes(bytes);
      const skipReason = previewSkipReason(inspection);
      if (skipReason) {
        file.previewStatus = AttachmentPreviewStatus.Skipped;
        this.logger.log(`PDF preview skipped (${skipReason}) ${tag} pageChunks=${inspection.pageChunks}`);
      } else {
        const optimized = await optimizePdf(bytes);
        const previewKey = previewKeyOf(file.key);
        await this.uploadService.putPrivateObject(previewKey, optimized, PDF_MIME);
        file.previewKey = previewKey;
        file.previewStatus = AttachmentPreviewStatus.Ready;
        this.logger.log(
          `PDF preview ready ${tag} previewKey=${previewKey} previewSize=${optimized.length} pageChunks=${inspection.pageChunks} ms=${Math.round(performance.now() - startedAt)}`,
        );
      }
    } catch (error) {
      if (error instanceof PdfProtectedError) {
        file.previewStatus = AttachmentPreviewStatus.Skipped;
        this.logger.log(`PDF preview skipped (${error.reason}) ${tag}`);
      } else {
        // Lỗi tạm thời (R2, mạng) hay lỗi của tệp đều thử lại vài lần, giãn dần; đủ số lần thì dừng
        file.previewAttempts += 1;
        const exhausted = file.previewAttempts >= PDF_PREVIEW_MAX_ATTEMPTS;
        file.previewStatus = exhausted ? AttachmentPreviewStatus.Failed : AttachmentPreviewStatus.Pending;
        this.logger.warn(
          `PDF preview failed (attempt ${file.previewAttempts}/${PDF_PREVIEW_MAX_ATTEMPTS}${exhausted ? ", giving up" : ""}) ${tag}: ${describeError(error)}`,
        );
      }
    }

    // Tệp bị xóa trong lúc đang xử lý: không giữ bản xem mồ côi trên R2
    const current = await this.orm.em.fork().findOne(AttachmentEntity, { id: file.id }, { fields: ["id", "deleted"] });
    if (current?.deleted && file.previewKey) {
      await this.uploadService
        .deleteObject(file.previewKey)
        .catch((error) => this.logger.warn(`Cannot delete preview of deleted attachment ${tag}: ${describeError(error)}`));
      file.previewKey = null;
    }
    await em.flush();
    return file.previewStatus;
  }
}
