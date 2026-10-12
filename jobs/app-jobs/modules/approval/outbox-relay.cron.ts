import { parseValuePositiveInt } from "@common/utils/parse-value.util";
import { AppSettingEntity, AppSettingType } from "@core-service/entities/app-setting";
import { MikroORM } from "@mikro-orm/core";
import { OutboxService } from "@modules/outbox/outbox.service";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

/**
 * Đẩy bù event outbox bị lỡ (RabbitMQ chết / process crash ngay sau commit) và dọn event đã đẩy
 * theo setting outbox_retention_days (0 / chưa cấu hình → giữ vĩnh viễn).
 */
@Injectable()
export class OutboxRelayCron {
  private readonly logger = new Logger(OutboxRelayCron.name);
  private running = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly orm: MikroORM,
  ) {}

  // Nhiều instance chạy cùng lúc vẫn an toàn: mỗi dòng bị khoá bằng SKIP LOCKED
  @Cron(CronExpression.EVERY_30_SECONDS)
  async relay() {
    if (this.running) return;
    this.running = true;
    try {
      const published = await this.outbox.relayPending();
      if (published) this.logger.log(`Relayed ${published} pending outbox event(s)`);
    } catch (err) {
      this.logger.error(`Outbox relay failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup() {
    const setting = await this.orm.em
      .fork()
      .findOne(AppSettingEntity, { key: AppSettingType.OUTBOX_RETENTION_DAYS, deleted: { $ne: true } });
    const days = parseValuePositiveInt(setting?.value);
    if (!days) {
      this.logger.log("Outbox cleanup skipped: outbox_retention_days not configured or 0, keeping all events");
      return;
    }
    const removed = await this.outbox.cleanup(days);
    if (removed) this.logger.log(`Removed ${removed} outbox event(s) published more than ${days} day(s) ago`);
  }
}
