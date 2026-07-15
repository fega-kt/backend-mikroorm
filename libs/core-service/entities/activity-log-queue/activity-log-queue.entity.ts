import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, Property } from "@mikro-orm/core";
import { NotificationType } from "../notification/notification.entity";

export enum ActivityLogQueueStatus {
  DRAFT = "draft",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
}

@Entity({ tableName: "activity_log_queue" })
export class ActivityLogQueueEntity extends BaseEntity {
  @Property()
  @Index()
  userId!: string;

  @Enum(() => NotificationType)
  type!: NotificationType;

  @Property({ type: "text" })
  data!: string;

  @Enum(() => ActivityLogQueueStatus)
  status: ActivityLogQueueStatus = ActivityLogQueueStatus.DRAFT;

  @Property()
  attempts: number = 0;

  @Property({ nullable: true })
  error?: string;

  @Property({ nullable: true })
  lastAttemptAt?: Date;
}
