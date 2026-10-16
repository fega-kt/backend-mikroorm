import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Property, types, Unique } from "@mikro-orm/core";

export enum AppSettingType {
  // ===== SYSTEM =====
  INACTIVE_DAYS_THRESHOLD = "inactive_days_threshold",
  INACTIVE_EMAIL_ALLOWED_LIST = "inactive_email_allowed_list",
  /** Số ngày giữ event outbox đã đẩy xong; 0 / chưa cấu hình → giữ vĩnh viễn */
  OUTBOX_RETENTION_DAYS = "outbox_retention_days",
  /**
   * Người chưa có workEmail có được nhận mail công việc (phê duyệt, nhắc duyệt…) qua loginName không.
   * - Bật: gửi tới loginName.
   * - Tắt / chưa cấu hình: không gửi cho người đó.
   * Người có workEmail luôn nhận qua workEmail. Mail tài khoản (OTP, mật khẩu) luôn gửi tới loginName, không phụ thuộc setting này.
   */
  WORK_EMAIL_FALLBACK_TO_LOGIN_NAME = "work_email_fallback_to_login_name",

  // ===== UI (client) =====
  CONTENT_FOCUS_OUTLINE_ENABLED = "content_focus_outline_enabled",
}

@Entity({ tableName: "app_settings" })
export class AppSettingEntity extends BaseEntity {
  @Enum(() => AppSettingType)
  @Unique()
  key!: AppSettingType;

  @Property({ type: "any" })
  value!: string | number | boolean | Record<string, unknown> | unknown[];

  @Property({ type: types.text, nullable: true })
  description?: string;
}
