import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { UserEntity } from "../user/user.entity";

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
  LOGIN_NEW_DEVICE = "LOGIN_NEW_DEVICE",
  /** Tài khoản bị tự khóa vì lâu không đăng nhập — chỉ có email (user không đăng nhập được nên không có noti in-app) */
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
  APPROVAL_PENDING = "APPROVAL_PENDING",
  APPROVAL_APPROVED = "APPROVAL_APPROVED",
  APPROVAL_REJECTED = "APPROVAL_REJECTED",
  APPROVAL_RETURNED = "APPROVAL_RETURNED",
  APPROVAL_CANCELLED = "APPROVAL_CANCELLED",
  APPROVAL_REMINDER = "APPROVAL_REMINDER",
  APPROVAL_ESCALATED = "APPROVAL_ESCALATED",
  APPROVAL_NOTIFY = "APPROVAL_NOTIFY",
  APPROVAL_STEP_APPROVED = "APPROVAL_STEP_APPROVED",
  APPROVAL_SHARED = "APPROVAL_SHARED",
  APPROVAL_COMMENTED = "APPROVAL_COMMENTED",
  /** File xuất Excel chạy nền đã xong (data.name, data.count; refType export_jobs) */
  EXPORT_READY = "EXPORT_READY",
  /** Xuất Excel chạy nền không thành công */
  EXPORT_FAILED = "EXPORT_FAILED",
}

@Entity({ tableName: "notifications" })
@Index({ properties: ["user", "id"] })
export class NotificationEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => UserEntity })
  user!: UserEntity;

  /** Người gây ra noti (vd: người duyệt) — null nếu do hệ thống, FE hiện icon theo `type` */
  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  actor?: UserEntity;

  @Enum(() => NotificationType)
  type!: NotificationType;

  /** Tham số để FE merge vào câu dịch theo `type` (vd: { days: 7 }) — BE không lưu câu chữ */
  @Property({ type: types.json, nullable: true })
  data?: Record<string, string | number>;
  /** ID của entity liên quan (task, project, timelog...) */
  @Property({ type: types.string, nullable: true })
  refId?: string;

  /** Tên bảng của entity liên quan (vd: "users") — giống `parentType` của activity log. FE map sang trang để mở khi bấm */
  @Property({ type: types.string, nullable: true })
  refType?: string;

  @Property({ type: types.boolean, default: false })
  isRead: boolean = false;

  @Property({ type: Date, nullable: true })
  readAt?: Date;
}
