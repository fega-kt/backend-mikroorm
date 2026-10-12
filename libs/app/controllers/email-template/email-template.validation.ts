import { z } from "zod";

const content = {
  name: z.string().trim().min(1, "Name is required").max(255),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  body: z.string().trim().min(1, "Body is required").max(50_000),
  description: z.string().trim().max(1000).optional().nullable(),
};

export const createEmailTemplateValidation = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[a-z][a-z0-9._-]*$/, "Code must start with a letter and contain only lowercase letters, digits, . _ -")
    .refine((v) => !v.startsWith("approval."), "Codes starting with approval. are reserved for system templates"),
  ...content,
});

export const updateEmailTemplateValidation = z.object(content);

export const previewEmailTemplateValidation = z.object({
  subject: z.string().max(500).default(""),
  body: z.string().max(50_000).default(""),
});

export type CreateEmailTemplateDto = z.infer<typeof createEmailTemplateValidation>;
export type UpdateEmailTemplateDto = z.infer<typeof updateEmailTemplateValidation>;
