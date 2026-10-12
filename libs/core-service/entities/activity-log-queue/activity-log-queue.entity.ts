import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, Property } from "@mikro-orm/core";
import { NotificationType } from "../notification/notification.entity";

export enum ActivityLogQueueStatus {
  DRAFT = "draft",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
  /** Không gửi (thiếu email người nhận, chưa cấu hình dịch vụ mail…) — lý do ở `error` */
  SKIPPED = "skipped",
}

/** Hàng đợi gửi mail: mỗi dòng là một email cho một người nhận (trạng thái, số lần thử, lỗi) */
@Entity({ tableName: "activity_log_queue" })
export class ActivityLogQueueEntity extends BaseEntity {
  @Property()
  @Index()
  userId!: string;

  @Enum(() => NotificationType)
  type!: NotificationType;

  @Property({ type: "text" })
  data!: string;

  /** Đối tượng liên quan (vd: approval_requests + id tờ trình) để lọc theo tờ trình */
  @Property({ nullable: true })
  refType?: string;

  @Property({ nullable: true })
  @Index()
  refId?: string;

  /** Id event nguồn (outbox) — consumer bỏ qua event nhận trùng */
  @Property({ nullable: true })
  @Index()
  eventId?: string;

  /** Địa chỉ email đã gửi tới */
  @Property({ nullable: true })
  recipient?: string;

  @Property({ type: "text", nullable: true })
  subject?: string;

  @Enum(() => ActivityLogQueueStatus)
  status: ActivityLogQueueStatus = ActivityLogQueueStatus.DRAFT;

  @Property()
  attempts: number = 0;

  @Property({ type: "text", nullable: true })
  error?: string;

  @Property({ nullable: true })
  lastAttemptAt?: Date;
}
