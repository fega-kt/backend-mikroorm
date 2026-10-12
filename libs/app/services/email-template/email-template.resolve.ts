import type { EntityManager } from "@mikro-orm/core";
import { EmailTemplateEntity } from "../../entities/email-template";
import { isSystemTemplate, SYSTEM_EMAIL_TEMPLATES, SystemEmailTemplate, type EmailTemplateContent } from "./email-template.defaults";

/**
 * Nội dung mẫu sẽ dùng để gửi: bản ghi trong DB (bản đè của mẫu hệ thống hoặc mẫu tùy chỉnh) → mặc định hệ thống.
 * Mẫu tùy chỉnh đã bị xoá → rơi về `fallback`.
 */
export async function resolveEmailTemplate(
  em: EntityManager,
  code: string,
  fallback: SystemEmailTemplate = SystemEmailTemplate.Notify,
): Promise<EmailTemplateContent> {
  const row = await em.findOne(EmailTemplateEntity, { code, deleted: { $ne: true } });
  if (row) return { code: row.code, name: row.name, subject: row.subject, body: row.body };
  if (isSystemTemplate(code)) return SYSTEM_EMAIL_TEMPLATES[code];
  return resolveEmailTemplate(em, fallback, fallback);
}
