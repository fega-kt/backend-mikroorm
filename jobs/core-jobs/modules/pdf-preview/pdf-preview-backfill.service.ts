import { AttachmentEntity, AttachmentPreviewStatus } from "@core-service/entities/attachment";
import {
  AttachmentPreviewService,
  PDF_PREVIEW_CANDIDATE,
  pdfPreviewDueFilter,
} from "@core-service/services/pdf-preview/attachment-preview.service";
import { MikroORM } from "@mikro-orm/core";
import { RedisService } from "@modules/redis/redis.service";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

/** Mỗi lượt xử lý tối đa chừng này tệp (mỗi tệp đọc trọn vào bộ nhớ, tối đa 100 MB): tồn đọng thì dọn dần qua các lượt sau */
const MAX_PER_RUN = 30;
const LOCK_KEY = "lock:attachment:pdf-preview-backfill";
/** Ngắn hơn chu kỳ cron (10 phút) để lượt sau không bị chặn nếu instance giữ khóa chết giữa chừng */
const LOCK_TTL_MS = 9 * 60 * 1000;

/**
 * Chạy bù bản xem PDF: các tệp pending đã chờ đủ lâu (PDF cũ, tệp mất message, tệp chờ thử lại sau lỗi — xem
 * PDF_PREVIEW_RETRY_DELAY_MINUTES). Tệp mới nhất trước vì hay được mở xem hơn.
 */
@Injectable()
export class PdfPreviewBackfillService {
  private readonly logger = new Logger(PdfPreviewBackfillService.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly previews: AttachmentPreviewService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async backfill() {
    this.logger.log(`PDF preview backfill started (max ${MAX_PER_RUN} per run)`);
    const locked = await this.redis.acquireLock(LOCK_KEY, LOCK_TTL_MS);
    if (locked === false) {
      this.logger.log("PDF preview backfill is running on another instance, skipping");
      return;
    }
    if (locked === null) this.logger.warn("Redis unavailable — running PDF preview backfill without lock");

    // PDF upload trước khi có tính năng vẫn ở none: chuyển sang pending để được xử lý, không phải chạy SQL khi deploy.
    // nativeUpdate không đổi updatedAt (vẫn là ngày cũ) nên các tệp này đến lượt ngay; các lượt sau không còn dòng nào khớp
    const marked = await this.orm.em
      .fork()
      .nativeUpdate(
        AttachmentEntity,
        { $and: [PDF_PREVIEW_CANDIDATE, { previewStatus: AttachmentPreviewStatus.None }] },
        { previewStatus: AttachmentPreviewStatus.Pending },
      );
    if (marked) this.logger.log(`PDF preview backfill: marked ${marked} existing PDF(s) as pending`);

    const files = await this.orm.em.fork().find(AttachmentEntity, pdfPreviewDueFilter(), {
      fields: ["id"],
      orderBy: { createdAt: "DESC" },
      limit: MAX_PER_RUN,
    });

    const counts: Partial<Record<AttachmentPreviewStatus, number>> = {};
    for (const file of files) {
      try {
        const status = await this.previews.process(file.id);
        if (status) counts[status] = (counts[status] ?? 0) + 1;
      } catch (error) {
        // Lỗi hạ tầng (DB / R2): để nguyên, lượt sau thử lại
        this.logger.warn(`PDF preview backfill: attachment ${file.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.logger.log(
      `PDF preview backfill finished: ${files.length} file(s) ${JSON.stringify(counts)}${files.length >= MAX_PER_RUN ? " (more left for the next run)" : ""}`,
    );
  }
}
