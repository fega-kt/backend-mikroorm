import { EntityManager, LockMode, MikroORM, type FilterQuery } from "@mikro-orm/core";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { OutboxEventEntity, OutboxEventStatus } from "./outbox-event.entity";

/** Đẩy lỗi quá số lần này thì đánh Failed (cron không thử nữa) */
const MAX_ATTEMPTS = 20;
const BATCH_SIZE = 100;

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly orm: MikroORM,
    @Optional() private readonly rabbitmq?: RabbitMQService,
  ) {}

  /** Ghi event vào outbox bằng `em` của transaction nghiệp vụ. Payload được gắn `eventId` = id dòng outbox */
  add(em: EntityManager, exchange: string, routingKey: string, payload: object) {
    const event = em.create(OutboxEventEntity, { exchange, routingKey, payload: {} });
    event.payload = { ...payload, eventId: event.id };
    return event;
  }

  /** Gọi ngay sau commit: đẩy các event vừa ghi. Lỗi / RabbitMQ chưa kết nối thì để cron đẩy bù */
  async publish(ids: string[]) {
    if (!ids.length) return 0;
    return this.relay({ id: { $in: ids } });
  }

  /** Cron: đẩy event còn chờ quá `olderThanMs` (bị lỡ lúc commit hoặc lần trước lỗi) */
  async relayPending(olderThanMs = 60_000) {
    const cutoff = new Date(Date.now() - olderThanMs);
    return this.relay({
      $or: [{ lastAttemptAt: null, createdAt: { $lt: cutoff } }, { lastAttemptAt: { $lt: cutoff } }],
    });
  }

  /** Xoá event đã đẩy xong quá `days` ngày (event chờ / lỗi không bao giờ bị xoá) */
  async cleanup(days: number) {
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.orm.em.fork().nativeDelete(OutboxEventEntity, { status: OutboxEventStatus.Published, publishedAt: { $lt: before } });
  }

  /**
   * Khoá các dòng chờ bằng FOR UPDATE SKIP LOCKED (nhiều instance / cron chạy cùng lúc không đẩy trùng),
   * đẩy từng event có xác nhận của broker rồi cập nhật trạng thái.
   */
  private async relay(where: FilterQuery<OutboxEventEntity>) {
    if (!this.rabbitmq?.isConnected) return 0;
    let published = 0;
    await this.orm.em.fork().transactional(async (em) => {
      const events = await em.find(
        OutboxEventEntity,
        { $and: [where, { status: OutboxEventStatus.Pending }] },
        { orderBy: { createdAt: "ASC" }, limit: BATCH_SIZE, lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE },
      );
      for (const event of events) {
        event.lastAttemptAt = new Date();
        event.attempts++;
        try {
          await this.rabbitmq.publishConfirmed(event.exchange, event.routingKey, event.payload, event.id);
          event.status = OutboxEventStatus.Published;
          event.publishedAt = new Date();
          event.error = undefined;
          published++;
        } catch (err) {
          event.error = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
          if (event.attempts >= MAX_ATTEMPTS) event.status = OutboxEventStatus.Failed;
          this.logger.warn(`Publish outbox event ${event.id} (${event.routingKey}) failed: ${event.error}`);
        }
      }
    });
    return published;
  }
}
