import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Property, types } from "@mikro-orm/core";

/** Ai thực hiện thao tác: người dùng qua API hay hệ thống (job, cron) */
export enum ActivityLogType {
  System = "system",
  User = "user",
}

export enum ActivityLogAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  RESTORE = "RESTORE",
  STATUS_CHANGE = "STATUS_CHANGE",
  ASSIGN = "ASSIGN",
  APPROVE = "APPROVE",
  REJECT = "REJECT",
  CHANGE_PASSWORD = "CHANGE_PASSWORD",
  FORGOT_PASSWORD = "FORGOT_PASSWORD",
}

/** parentType cho log không gắn với bảng cụ thể, hoặc log tạo trước khi có cột parentType */
export const UNKNOWN_PARENT_TYPE = "unknown";

@Entity({ tableName: "activity_logs" })
export class ActivityLogEntity extends BaseEntity {
  @Property({ type: types.string })
  parentId!: string;

  /**
   * Tên bảng mà parentId trỏ tới (vd: "users", "departments"), hoặc UNKNOWN_PARENT_TYPE.
   * Log mới bắt buộc truyền, ActivityLogService validate theo metadata.
   */
  @Property({ type: types.string, default: UNKNOWN_PARENT_TYPE })
  parentType!: string;

  @Enum(() => ActivityLogAction)
  action!: ActivityLogAction;

  @Property({ type: types.json, nullable: true })
  oldData?: Record<string, unknown>;

  @Property({ type: types.json, nullable: true })
  newData?: Record<string, unknown>;

  @Enum(() => ActivityLogType)
  type!: ActivityLogType;

  @Property({ type: types.string })
  ip!: string;

  @Property({ type: types.string })
  device!: string;

  // "N/A" for rows created before request ids existed or outside an HTTP request
  @Property({ type: types.string, default: "N/A" })
  requestId!: string;
}
