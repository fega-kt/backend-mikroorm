import { FilterQuery, MikroORM } from "@mikro-orm/core";
import { AttachmentEntity, AttachmentStatus } from "@core-service/entities/attachment";
import { PENDING_UPLOAD_MAX_AGE_MINUTES } from "@core-service/services/upload/upload.constants";
import { UploadService } from "@core-service/services/upload/upload.service";
import { RedisService } from "@modules/redis/redis.service";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

const BATCH_SIZE = 200;
/** Trần mỗi lượt chạy: tồn đọng nhiều thì dọn dần qua các giờ sau, không giữ job quá lâu */
const MAX_PER_RUN = 2000;

const LOCK_KEY = "lock:attachment:pending-cleanup";
/** Ngắn hơn chu kỳ cron (1 giờ) để lượt sau không bị chặn nếu instance giữ khóa chết giữa chừng */
const LOCK_TTL_MS = 50 * 60 * 1000;

/** Dọn các lượt upload thẳng lên R2 bị bỏ dở (đã xin link nhưng không bao giờ xác nhận) */
@Injectable()
export class PendingAttachmentCleanupService {
  private readonly logger = new Logger(PendingAttachmentCleanupService.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly uploadService: UploadService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup() {
    this.logger.log(
      `Pending attachment cleanup started (older than ${PENDING_UPLOAD_MAX_AGE_MINUTES} minutes, max ${MAX_PER_RUN} per run)`,
    );
    // Nhiều instance chạy cùng lúc: chỉ một instance dọn (xóa trùng không sai nhưng tốn công và lặp log)
    const locked = await this.redis.acquireLock(LOCK_KEY, LOCK_TTL_MS);
    if (locked === false) {
      this.logger.log("Pending attachment cleanup is running on another instance, skipping");
      return;
    }
    if (locked === null) this.logger.warn("Redis unavailable — running pending attachment cleanup without lock");

    const cutoff = new Date(Date.now() - PENDING_UPLOAD_MAX_AGE_MINUTES * 60 * 1000);
    let scanned = 0;
    let removed = 0;
    // Con trỏ (createdAt, id) tăng dần: bản ghi xóa lỗi không bị lấy lại trong cùng lượt nên không chặn các bản ghi sau
    let cursor: { createdAt: Date; id: string } | undefined;

    while (scanned < MAX_PER_RUN) {
      const em = this.orm.em.fork();
      const where: FilterQuery<AttachmentEntity> = { status: AttachmentStatus.Pending, deleted: { $ne: true }, createdAt: { $lt: cutoff } };
      if (cursor) {
        where.$or = [{ createdAt: { $gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { $gt: cursor.id } }];
      }
      const stale = await em.find(AttachmentEntity, where, {
        orderBy: { createdAt: "ASC", id: "ASC" },
        limit: Math.min(BATCH_SIZE, MAX_PER_RUN - scanned),
      });
      if (!stale.length) break;

      for (const attachment of stale) {
        try {
          // Xóa object chưa tồn tại vẫn thành công, nên an toàn với lượt chưa kịp upload
          await this.uploadService.deleteAttachmentObjects(attachment);
          attachment.deleted = true;
          removed++;
        } catch (error) {
          // Để nguyên bản ghi: lượt chạy sau (giờ sau) thử lại
          this.logger.warn(`Cannot clean pending attachment ${attachment.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      await em.flush();

      scanned += stale.length;
      const last = stale[stale.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
      if (stale.length < BATCH_SIZE) break;
    }

    // Luôn ghi kết thúc (kể cả không có gì để dọn) để mỗi lượt chạy có cặp log bắt đầu / kết thúc
    this.logger.log(
      `Pending attachment cleanup finished: cleaned ${removed}/${scanned} abandoned pending uploads${scanned >= MAX_PER_RUN ? " (more left for the next run)" : ""}`,
    );
  }
}
