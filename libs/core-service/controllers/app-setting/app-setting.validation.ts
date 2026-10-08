import { listFilterValidation } from "@common/pagination/pagination.validation";
import { z } from "zod";
import { type AppSettingMeta, AppSettingType, AppSettingValueType, type DateBound } from "../../entities/app-setting";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_DATE_REGEX = /^today([+-]\d+)?$/;

/** Đổi mốc ngày ("YYYY-MM-DD" | "today" | "today+7" | "today-30") sang "YYYY-MM-DD" theo giờ Việt Nam */
export function resolveDateBound(bound: DateBound): string {
  const match = RELATIVE_DATE_REGEX.exec(bound);
  if (!match) return bound;

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
  const [year, month, day] = today.split("-").map(Number);
  const offset = Number(match[1] ?? 0);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

/** Schema kiểm tra value theo type + rule khai báo trong APP_SETTING_META */
export function buildAppSettingValueSchema(meta: AppSettingMeta): z.ZodType {
  switch (meta.type) {
    case AppSettingValueType.STRING: {
      const { minLength = 1, maxLength, pattern } = meta.rule ?? {};
      let schema = z.string().trim().min(minLength);
      if (maxLength !== undefined) schema = schema.max(maxLength);
      if (pattern) schema = schema.regex(new RegExp(pattern));
      return schema;
    }
    case AppSettingValueType.NUMBER: {
      const { min, max, integer } = meta.rule ?? {};
      let schema = z.number().finite();
      if (integer) schema = schema.int();
      if (min !== undefined) schema = schema.min(min);
      if (max !== undefined) schema = schema.max(max);
      return schema;
    }
    case AppSettingValueType.DATE: {
      const { min, max } = meta.rule ?? {};
      return z
        .string()
        .regex(DATE_REGEX, "Date must be in YYYY-MM-DD format")
        .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date")
        .superRefine((v, ctx) => {
          // So sánh chuỗi YYYY-MM-DD theo thứ tự từ điển là đúng thứ tự ngày; mốc "today" tính lại mỗi lần lưu
          const minDate = min && resolveDateBound(min);
          const maxDate = max && resolveDateBound(max);
          if (minDate && v < minDate) ctx.addIssue({ code: "custom", message: `Date must be on or after ${minDate}` });
          if (maxDate && v > maxDate) ctx.addIssue({ code: "custom", message: `Date must be on or before ${maxDate}` });
        });
    }
    case AppSettingValueType.BOOLEAN:
      return z.boolean();
    case AppSettingValueType.EMAILS:
    case AppSettingValueType.STRING_ARRAY: {
      const { minItems, maxItems } = meta.rule ?? {};
      let schema = z.array(meta.type === AppSettingValueType.EMAILS ? z.email() : z.string());
      if (minItems !== undefined) schema = schema.min(minItems);
      if (maxItems !== undefined) schema = schema.max(maxItems);
      return schema;
    }
    case AppSettingValueType.JSON:
      return z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);
  }
}

const appSettingValue = z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown()), z.array(z.unknown())]);

export const appSettingKeyValidation = z.nativeEnum(AppSettingType);

export const appSettingHistoryValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** page/limit dùng chung; keyword ghi đè vì lọc bằng includes nên không escape ký tự regex */
export const appSettingFilterValidation = listFilterValidation.extend({
  /** Tìm theo key hoặc ghi chú, không phân biệt hoa thường */
  keyword: z.string().trim().optional(),
});

export const createAppSettingValidation = z.object({
  key: appSettingKeyValidation,
  value: appSettingValue,
  description: z.string().max(500).optional(),
});

export const updateAppSettingValidation = z.object({
  value: appSettingValue,
  description: z.string().max(500).optional(),
});
