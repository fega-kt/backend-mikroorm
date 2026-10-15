import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Property, types, Unique } from "@mikro-orm/core";

export enum AppSettingType {
  // ===== SYSTEM =====
  INACTIVE_DAYS_THRESHOLD = "inactive_days_threshold",
  INACTIVE_EMAIL_ALLOWED_LIST = "inactive_email_allowed_list",
  /** Số ngày giữ event outbox đã đẩy xong; 0 / chưa cấu hình → giữ vĩnh viễn */
  OUTBOX_RETENTION_DAYS = "outbox_retention_days",

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
