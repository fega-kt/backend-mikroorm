import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, ManyToOne, Property, types } from "@mikro-orm/core";
import { UserEntity } from "@modules/user/entity/user.entity";

export enum NotificationType {
  TASK_ASSIGNED = "TASK_ASSIGNED",
  TASK_STATUS_CHANGED = "TASK_STATUS_CHANGED",
  TASK_COMMENT = "TASK_COMMENT",
  DEADLINE_REMINDER = "DEADLINE_REMINDER",
  TIMELOG_APPROVED = "TIMELOG_APPROVED",
  TIMELOG_REJECTED = "TIMELOG_REJECTED",
  PROJECT_MEMBER_ADDED = "PROJECT_MEMBER_ADDED",
  MILESTONE_DUE = "MILESTONE_DUE",
  SPRINT_STARTED = "SPRINT_STARTED",
  SPRINT_COMPLETED = "SPRINT_COMPLETED",
  LOGIN_INACTIVE_REMINDER = "LOGIN_INACTIVE_REMINDER",
}

@Entity({ tableName: "notifications" })
export class NotificationEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => UserEntity })
  user!: UserEntity;

  @Enum(() => NotificationType)
  type!: NotificationType;

  @Property({ type: types.string })
  title!: string;

  @Property({ type: types.string })
  message!: string;

  /** ID của entity liên quan (task, project, timelog...) */
  @Property({ type: types.string, nullable: true })
  refId?: string;

  /** Loại entity liên quan */
  @Property({ type: types.string, nullable: true })
  refType?: string;

  @Property({ type: types.boolean, default: false })
  isRead: boolean = false;

  @Property({ type: Date, nullable: true })
  readAt?: Date;
}
