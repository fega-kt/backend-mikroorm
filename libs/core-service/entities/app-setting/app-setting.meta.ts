import { AppSettingType } from "./app-setting.entity";

/** Kiểu dữ liệu của value — quyết định cách validate khi lưu và input hiển thị trên FE */
export enum AppSettingValueType {
  STRING = "string",
  NUMBER = "number",
  BOOLEAN = "boolean",
  /** Ngày dạng "YYYY-MM-DD" */
  DATE = "date",
  EMAILS = "emails",
  STRING_ARRAY = "string_array",
  JSON = "json",
}

export interface StringRule {
  minLength?: number;
  maxLength?: number;
  /** Regex (không kèm dấu /) mà value phải khớp */
  pattern?: string;
}

export interface NumberRule {
  min?: number;
  max?: number;
  /** true: chỉ nhận số nguyên */
  integer?: boolean;
}

/**
 * Mốc ngày: "YYYY-MM-DD" cố định, hoặc "today" (theo giờ Việt Nam).
 * Có thể cộng/trừ ngày từ hôm nay: "today+7", "today-30".
 */
export type DateBound = string;

export interface DateRule {
  min?: DateBound;
  max?: DateBound;
}

export interface ArrayRule {
  minItems?: number;
  maxItems?: number;
}

interface MetaBase {
  /** false: key nội bộ, không trả về FE và không cho thao tác qua API */
  isShow: boolean;
  /**
   * true: giá trị được trả cho mọi user đăng nhập qua GET app-setting/client (FE giữ trong memory).
   * Mặc định (không khai báo) là false, key mới không tự lộ ra client. Không bật cho key nhạy cảm.
   */
  clientVisible?: boolean;
}

/** type nào chỉ khai báo được rule của type đó */
export type AppSettingMeta = MetaBase &
  (
    | { type: AppSettingValueType.STRING; rule?: StringRule }
    | { type: AppSettingValueType.NUMBER; rule?: NumberRule }
    | { type: AppSettingValueType.DATE; rule?: DateRule }
    | { type: AppSettingValueType.EMAILS | AppSettingValueType.STRING_ARRAY; rule?: ArrayRule }
    | { type: AppSettingValueType.BOOLEAN | AppSettingValueType.JSON; rule?: never }
  );

/** Khai báo bắt buộc cho mọi key — thêm key mới vào AppSettingType thì phải khai báo ở đây */
export const APP_SETTING_META: Record<AppSettingType, AppSettingMeta> = {
  [AppSettingType.MAIL_TEMPLATE_PASSWORD_CHANGED]: { type: AppSettingValueType.STRING, isShow: true },
  [AppSettingType.MAIL_TEMPLATE_FORGOT_PASSWORD_OTP]: { type: AppSettingValueType.STRING, isShow: true },
  [AppSettingType.MAIL_TEMPLATE_NEW_PASSWORD]: { type: AppSettingValueType.STRING, isShow: true },
  [AppSettingType.MAIL_TEMPLATE_ACCOUNT_CREATED]: { type: AppSettingValueType.STRING, isShow: true },
  [AppSettingType.MAIL_TEMPLATE_LOGIN_OTP]: { type: AppSettingValueType.STRING, isShow: true },

  [AppSettingType.INACTIVE_DAYS_THRESHOLD]: {
    type: AppSettingValueType.NUMBER,
    isShow: true,
    rule: { min: 1, max: 365, integer: true },
  },
  [AppSettingType.INACTIVE_EMAIL_ALLOWED_LIST]: { type: AppSettingValueType.EMAILS, isShow: true },

  /** Bật/tắt viền focus đen quanh vùng nội dung chính ở FE */
  [AppSettingType.CONTENT_FOCUS_OUTLINE_ENABLED]: { type: AppSettingValueType.BOOLEAN, isShow: true, clientVisible: true },

  [AppSettingType.MAIL_TEMPLATE_INACTIVE_REMINDER]: { type: AppSettingValueType.STRING, isShow: true },
};
