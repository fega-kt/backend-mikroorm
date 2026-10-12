import { BaseService } from "@common/base/base.service";
import { ENV } from "@config/env.config";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import type { CreateEmailTemplateDto, UpdateEmailTemplateDto } from "../../controllers/email-template/email-template.validation";
import { EmailTemplateEntity } from "../../entities/email-template";
import { isSystemTemplate, SYSTEM_EMAIL_TEMPLATES } from "./email-template.defaults";
import { renderTemplate, sampleVariables, TEMPLATE_VARIABLES, usedVariables, wrapEmailHtml } from "./email-template.render";

export interface EmailTemplateView {
  code: string;
  name: string;
  subject: string;
  body: string;
  description?: string | null;
  /** Mẫu hệ thống (gắn với sự kiện tờ trình) */
  system: boolean;
  /** Mẫu hệ thống đã được sửa so với mặc định */
  customized: boolean;
  updatedAt?: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class EmailTemplateService extends BaseService<EmailTemplateEntity> {
  constructor(
    @InjectRepository(EmailTemplateEntity)
    protected readonly repo: EntityRepository<EmailTemplateEntity>,
  ) {
    super();
  }

  private get em() {
    return this.repo.getEntityManager();
  }

  /** Mẫu hệ thống (mặc định hoặc đã sửa) trước, rồi mẫu tùy chỉnh */
  async listTemplates(): Promise<EmailTemplateView[]> {
    const rows = await this.repo.find({ deleted: { $ne: true } }, { orderBy: { name: "ASC" } });
    const byCode = new Map(rows.map((r) => [r.code, r]));
    const system = Object.values(SYSTEM_EMAIL_TEMPLATES).map((tpl) => {
      const row = byCode.get(tpl.code);
      return row ? this.view(row) : { ...tpl, system: true, customized: false };
    });
    const custom = rows.filter((r) => !isSystemTemplate(r.code)).map((r) => this.view(r));
    return [...system, ...custom];
  }

  async getTemplate(code: string): Promise<EmailTemplateView> {
    const row = await this.repo.findOne({ code, deleted: { $ne: true } });
    if (row) return this.view(row);
    if (isSystemTemplate(code)) return { ...SYSTEM_EMAIL_TEMPLATES[code], system: true, customized: false };
    throw new NotFoundException("Email template not found");
  }

  async createTemplate(data: CreateEmailTemplateDto) {
    const exists = await this.repo.count({ code: data.code, deleted: { $ne: true } });
    if (exists) throw new ConflictException(`Email template "${data.code}" already exists`);
    // Mã đã bị xoá mềm trước đó: dùng lại bản ghi (code là unique)
    const old = await this.repo.findOne({ code: data.code });
    if (old) {
      this.em.assign(old, { ...data, deleted: false, ...this.getDefaultValuesForUpdate() });
      await this.em.flush();
      return this.view(old);
    }
    return this.view(await this.addOne({ ...data, description: data.description ?? undefined }));
  }

  /** Sửa mẫu tùy chỉnh, hoặc lưu bản đè cho mẫu hệ thống */
  async updateTemplate(code: string, data: UpdateEmailTemplateDto) {
    const row = await this.repo.findOne({ code });
    if (row) {
      this.em.assign(row, { ...data, deleted: false, ...this.getDefaultValuesForUpdate() });
      await this.em.flush();
      return this.view(row);
    }
    if (!isSystemTemplate(code)) throw new NotFoundException("Email template not found");
    return this.view(await this.addOne({ code, ...data, description: data.description ?? undefined }));
  }

  /** Xoá mẫu tùy chỉnh; với mẫu hệ thống = khôi phục nội dung mặc định */
  async deleteTemplate(code: string) {
    const row = await this.repo.findOne({ code, deleted: { $ne: true } });
    if (!row) {
      if (isSystemTemplate(code)) return { code, reset: true };
      throw new NotFoundException("Email template not found");
    }
    if (isSystemTemplate(code)) {
      await this.em.removeAndFlush(row);
      return { code, reset: true };
    }
    await this.remove(row.id);
    return { code, reset: false };
  }

  variables() {
    return TEMPLATE_VARIABLES;
  }

  /** Xem trước với dữ liệu mẫu; trả về các biến không tồn tại để cảnh báo */
  preview(subject: string, body: string) {
    const vars = sampleVariables();
    const known = new Set(TEMPLATE_VARIABLES.map((v) => v.key));
    const unknown = usedVariables(`${subject} ${body}`).filter((key) => !known.has(key) && !key.startsWith("payload."));
    return {
      subject: renderTemplate(subject, vars, { html: false }),
      html: wrapEmailHtml(renderTemplate(body, vars, { html: true }), `${ENV.FRONTEND_URL.replace(/\/$/, "")}/approval/requests/preview`),
      unknownVariables: unknown,
    };
  }

  private view(row: EmailTemplateEntity): EmailTemplateView {
    return {
      code: row.code,
      name: row.name,
      subject: row.subject,
      body: row.body,
      description: row.description,
      system: isSystemTemplate(row.code),
      customized: isSystemTemplate(row.code),
      updatedAt: row.updatedAt,
    };
  }
}
