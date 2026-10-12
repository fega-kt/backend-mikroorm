import { Entity, Enum, Index, PrimaryKey, Property, types } from "@mikro-orm/core";
import { v7 as uuidv7 } from "uuid";

export enum OutboxEventStatus {
  /** Chờ đẩy lên RabbitMQ (vừa commit, hoặc lần đẩy trước lỗi) */
  Pending = "pending",
  Published = "published",
  /** Đẩy lỗi quá số lần cho phép — cần xem lại */
  Failed = "failed",
}

/**
 * Transactional outbox: event ghi cùng transaction với nghiệp vụ, commit xong mới đẩy lên RabbitMQ.
 * RabbitMQ chết / process crash giữa chừng thì event vẫn nằm ở đây và được cron đẩy bù — không mất event.
 */
@Entity({ tableName: "outbox_events" })
@Index({ properties: ["status", "createdAt"] })
export class OutboxEventEntity {
  /** Cũng là `eventId` trong payload — consumer dùng để bỏ qua event nhận trùng */
  @PrimaryKey({ type: "uuid" })
  id: string = uuidv7();

  @Property()
  exchange!: string;

  @Property()
  routingKey!: string;

  @Property({ type: types.json })
  payload!: Record<string, unknown>;

  @Enum(() => OutboxEventStatus)
  status: OutboxEventStatus = OutboxEventStatus.Pending;

  @Property()
  attempts: number = 0;

  @Property({ type: "text", nullable: true })
  error?: string;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ nullable: true })
  lastAttemptAt?: Date;

  @Property({ nullable: true })
  publishedAt?: Date;
}
