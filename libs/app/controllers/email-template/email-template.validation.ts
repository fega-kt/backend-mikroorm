import { isReservedTemplateCode } from "@core-service/services/email-template/email-template.resolve";
import { z } from "zod";

/** Nội dung là toàn bộ email (HTML dựng bằng bảng + style inline) nên dài hơn một đoạn văn nhiều */
const BODY_MAX = 200_000;

const content = {
  name: z.string().trim().min(1, "Name is required").max(255),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  body: z.string().trim().min(1, "Body is required").max(BODY_MAX),
  description: z.string().trim().max(1000).optional().nullable(),
};

export const createEmailTemplateValidation = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z][a-z0-9._-]*$/, "Code must start with a letter and contain only lowercase letters, digits, . _ -")
    .refine((v) => !isReservedTemplateCode(v), "Codes starting with approval., auth. or system. are reserved for system templates"),
  ...content,
});

export const updateEmailTemplateValidation = z.object(content);

export const previewEmailTemplateValidation = z.object({
  subject: z.string().max(500).default(""),
  body: z.string().max(BODY_MAX).default(""),
  /** Mã mẫu đang sửa — chọn bộ biến mẫu theo nhóm; bỏ trống = mẫu tùy chỉnh */
  code: z.string().max(100).optional(),
});

export type CreateEmailTemplateDto = z.infer<typeof createEmailTemplateValidation>;
export type UpdateEmailTemplateDto = z.infer<typeof updateEmailTemplateValidation>;
