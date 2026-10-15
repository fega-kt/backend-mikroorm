import type { EntityManager } from "@mikro-orm/core";
import { EmailTemplateEntity } from "../../entities/email-template";

export interface EmailTemplateContent {
  code: string;
  name: string;
  subject: string;
  body: string;
}

/** Nhóm mẫu theo tiền tố mã; mã không thuộc nhóm hệ thống nào là mẫu tùy chỉnh (bước Thông báo của quy trình) */
export enum EmailTemplateCategory {
  Approval = "approval",
  Auth = "auth",
  System = "system",
  Custom = "custom",
}

const RESERVED_CATEGORIES = [EmailTemplateCategory.Approval, EmailTemplateCategory.Auth, EmailTemplateCategory.System];

export function templateCategory(code: string): EmailTemplateCategory {
  return RESERVED_CATEGORIES.find((category) => code.startsWith(`${category}.`)) ?? EmailTemplateCategory.Custom;
}

/** Mã thuộc nhóm dành cho mẫu hệ thống — không cho tạo mẫu tùy chỉnh trùng tiền tố */
export const isReservedTemplateCode = (code: string) => templateCategory(code) !== EmailTemplateCategory.Custom;

/** Bản ghi trong DB (bản đè của mẫu hệ thống hoặc mẫu tùy chỉnh); không có → null */
export async function findEmailTemplate(em: EntityManager, code: string): Promise<EmailTemplateContent | null> {
  const row = await em.findOne(EmailTemplateEntity, { code, deleted: { $ne: true } });
  return row ? { code: row.code, name: row.name, subject: row.subject, body: row.body } : null;
}
