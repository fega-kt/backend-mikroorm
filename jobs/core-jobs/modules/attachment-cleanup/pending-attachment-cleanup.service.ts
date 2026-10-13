import { MikroORM } from "@mikro-orm/core";
import { AttachmentEntity, AttachmentStatus } from "@core-service/entities/attachment";
import { PENDING_UPLOAD_MAX_AGE_MINUTES } from "@core-service/services/upload/upload.constants";
import { UploadService } from "@core-service/services/upload/upload.service";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

const BATCH_SIZE = 200;

/** Dọn các lượt upload thẳng lên R2 bị bỏ dở (đã xin link nhưng không bao giờ xác nhận) */
@Injectable()
export class PendingAttachmentCleanupService {
  private readonly logger = new Logger(PendingAttachmentCleanupService.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly uploadService: UploadService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup() {
    const em = this.orm.em.fork();
    const cutoff = new Date(Date.now() - PENDING_UPLOAD_MAX_AGE_MINUTES * 60 * 1000);
    const stale = await em.find(
      AttachmentEntity,
      { status: AttachmentStatus.Pending, deleted: { $ne: true }, createdAt: { $lt: cutoff } },
      { limit: BATCH_SIZE },
    );
    if (!stale.length) return;

    let removed = 0;
    for (const attachment of stale) {
      try {
        // Xóa object chưa tồn tại vẫn thành công, nên an toàn với lượt chưa kịp upload
        await this.uploadService.deleteObject(attachment.key);
        attachment.deleted = true;
        removed++;
      } catch (error) {
        this.logger.warn(`Cannot clean pending attachment ${attachment.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await em.flush();
    this.logger.log(`Cleaned ${removed}/${stale.length} abandoned pending uploads`);
  }
}
