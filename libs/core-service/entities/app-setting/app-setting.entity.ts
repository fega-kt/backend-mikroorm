import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Property, types, Unique } from "@mikro-orm/core";

export enum AppSettingType {
  // ===== MAIL TEMPLATES (auth) =====
  MAIL_TEMPLATE_PASSWORD_CHANGED = "mail_template_password_changed",
  MAIL_TEMPLATE_FORGOT_PASSWORD_OTP = "mail_template_forgot_password_otp",
  MAIL_TEMPLATE_NEW_PASSWORD = "mail_template_new_password",
  MAIL_TEMPLATE_ACCOUNT_CREATED = "mail_template_account_created",
  MAIL_TEMPLATE_LOGIN_OTP = "mail_template_login_otp",

  // ===== SYSTEM =====
  INACTIVE_DAYS_THRESHOLD = "inactive_days_threshold",
  INACTIVE_EMAIL_ALLOWED_LIST = "inactive_email_allowed_list",

  // ===== MAIL TEMPLATES (notification) =====
  MAIL_TEMPLATE_INACTIVE_REMINDER = "mail_template_inactive_reminder",
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
