import { z } from "zod";

/** Ngôn ngữ lưu trong bảng (mỗi ngôn ngữ một cột, đều bắt buộc) */
export const I18N_LANGUAGES = ["vi", "en", "zh"] as const;
export type I18nLanguage = (typeof I18N_LANGUAGES)[number];

/** vd: form.<formId> */
export const namespaceValidation = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9._:-]+$/, "Namespace may only contain letters, digits and . _ : -");

export const dictionaryQueryValidation = z.object({ lang: z.enum(I18N_LANGUAGES) });

const keyValidation = z.string().trim().min(1).max(170);
const translation = z.string().trim().min(1, "Translation is required").max(5000);

/**
 * `items`: mỗi mục thiết lập đủ cả ba ngôn ngữ cùng lúc (key là phần sau namespace), ghi đè mục cũ cùng key.
 * `remove`: các key cần xóa (không còn bản dịch nào).
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
