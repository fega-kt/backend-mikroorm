import type { EntityManager } from "@mikro-orm/core";
import { type EmailTemplateContent, findEmailTemplate } from "@core-service/services/email-template/email-template.resolve";
import { isSystemTemplate, SYSTEM_EMAIL_TEMPLATES, SystemEmailTemplate } from "./email-template.defaults";

/**
 * Nội dung mẫu sẽ dùng để gửi: bản ghi trong DB (bản đè của mẫu hệ thống hoặc mẫu tùy chỉnh) → mặc định hệ thống.
 * Mẫu tùy chỉnh đã bị xoá → rơi về `fallback`.
 */
export async function resolveEmailTemplate(
  em: EntityManager,
  code: string,
  fallback: SystemEmailTemplate = SystemEmailTemplate.Notify,
): Promise<EmailTemplateContent> {
  const row = await findEmailTemplate(em, code);
  if (row) return row;
  if (isSystemTemplate(code)) return SYSTEM_EMAIL_TEMPLATES[code];
  return resolveEmailTemplate(em, fallback, fallback);
}
