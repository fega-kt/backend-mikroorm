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
  /** Yêu cầu OTP quên mật khẩu */
  FORGOT_PASSWORD = "FORGOT_PASSWORD",
  /** Nhập đúng OTP quên mật khẩu, mật khẩu mới đã được gửi qua email */
  RESET_PASSWORD = "RESET_PASSWORD",
  /** Nhập sai/hết hạn OTP quên mật khẩu */
  RESET_PASSWORD_FAILED = "RESET_PASSWORD_FAILED",
  /** Yêu cầu OTP đăng nhập */
  LOGIN_OTP_REQUEST = "LOGIN_OTP_REQUEST",
  /** Đăng nhập bằng OTP thành công */
  LOGIN_OTP = "LOGIN_OTP",
  /** Đăng nhập bằng OTP thất bại (sai OTP, hết hạn, quá số lần thử) */
  LOGIN_OTP_FAILED = "LOGIN_OTP_FAILED",
}

/**
 * parentType cho log không gắn với một bảng cụ thể (bản ghi trong bảng thì dùng tên bảng).
 * Log của nhóm này không hiện ở màn lịch sử của bảng nào, vì các màn đó lọc theo tên bảng.
 */
export enum ActivityLogSubject {
  /** Đăng nhập, đăng xuất, đổi/quên mật khẩu; parentId là id user */
  Auth = "auth",
  /** Log tạo trước khi có cột parentType */
  Unknown = "unknown",
}

@Entity({ tableName: "activity_logs" })
export class ActivityLogEntity extends BaseEntity {
  @Property({ type: types.string })
  parentId!: string;

  /**
   * Loại đối tượng của log: tên bảng mà parentId trỏ tới (vd: "users", "departments") hoặc một giá trị ActivityLogSubject.
   * Log mới bắt buộc truyền, ActivityLogService validate theo metadata.
   */
  @Property({ type: types.string, default: ActivityLogSubject.Unknown })
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
