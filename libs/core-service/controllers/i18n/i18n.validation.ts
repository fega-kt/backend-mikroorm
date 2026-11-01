import { z } from "zod";

/** Ngôn ngữ lưu trong bảng (mỗi ngôn ngữ một cột) */
export const I18N_LANGUAGES = ["vi", "en", "zh"] as const;
export type I18nLanguage = (typeof I18N_LANGUAGES)[number];

/** vd: form.<formId>, app (chuỗi giao diện — đè lên file JSON của frontend) */
export const namespaceValidation = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9._:-]+$/, "Namespace may only contain letters, digits and . _ : -");

/**
 * Phân trang cho trang quản lý; `search` tìm theo key hoặc nội dung;
 * `namespace` lọc theo tiền tố (`app`, `form`, `form.<formId>`), bỏ trống = tất cả
 */
export const translationListValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  namespace: namespaceValidation.optional(),
});

const keyValidation = z.string().trim().min(1, "Key is required").max(170);
const translation = z.string().trim().min(1, "Translation is required").max(5000);

/**
 * `items`: mỗi mục thiết lập cả ba ngôn ngữ cùng lúc, bắt buộc có key (phần sau namespace) và đủ cả ba ngôn ngữ; ghi đè mục cũ cùng key.
 * `remove`: các key cần xóa (xóa mềm).
 */
export const saveTranslationsValidation = z.object({
  items: z
    .array(
      z.object({
        key: keyValidation,
        vi: translation,
        en: translation,
        zh: translation,
      }),
    )
    .max(1000)
    .default([]),
  remove: z.array(keyValidation).max(1000).default([]),
});
