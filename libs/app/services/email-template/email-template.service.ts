import { BaseService } from "@common/base/base.service";
import { FrontendPath, frontendUrl } from "@common/constants/frontend-path.constant";
import { ENV } from "@config/env.config";
import { EmailTemplateEntity } from "@core-service/entities/email-template";
import {
  CORE_EMAIL_TEMPLATES,
  CORE_REQUIRED_VARIABLES,
  CORE_TEMPLATE_VARIABLES,
  isCoreTemplate,
} from "@core-service/services/email-template/core-email.templates";
import { brandVariables, type EmailTemplateBody, toSampleVariables } from "@core-service/services/email-template/email-template.render";
import {
  EmailTemplateCategory,
  type EmailTemplateContent,
  templateCategory,
} from "@core-service/services/email-template/email-template.resolve";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import type { CreateEmailTemplateDto, UpdateEmailTemplateDto } from "../../controllers/email-template/email-template.validation";
import { CUSTOM_TEMPLATE_STARTER, isSystemTemplate, SYSTEM_EMAIL_TEMPLATES } from "./email-template.defaults";
import { renderEmail, TEMPLATE_VARIABLES, type TemplateVariable, usedVariables } from "./email-template.render";

export interface EmailTemplateView {
  code: string;
  name: string;
  subject: string;
  body: string;
  description?: string | null;
  /** Nhóm theo tiền tố mã: tờ trình, đăng nhập/tài khoản, hệ thống, tùy chỉnh */
  category: EmailTemplateCategory;
  /** Mẫu hệ thống (gắn với một sự kiện) — chỉ sửa / khôi phục, không xoá */
  system: boolean;
  /** Mẫu hệ thống đã được sửa so với mặc định */
  customized: boolean;
  /** Biến bắt buộc phải còn trong mẫu */
  requiredVariables: string[];
  updatedAt?: Date;
}

/** Mặc định của mọi mẫu hệ thống: tờ trình (app) + đăng nhập, mật khẩu, nhắc nhở (core) */
const DEFAULT_TEMPLATES: EmailTemplateContent[] = [...Object.values(SYSTEM_EMAIL_TEMPLATES), ...Object.values(CORE_EMAIL_TEMPLATES)];

const isBuiltIn = (code: string) => isSystemTemplate(code) || isCoreTemplate(code);
const defaultOf = (code: string): EmailTemplateContent | undefined =>
  isSystemTemplate(code) ? SYSTEM_EMAIL_TEMPLATES[code] : isCoreTemplate(code) ? CORE_EMAIL_TEMPLATES[code] : undefined;
const requiredVariablesOf = (code: string) => (isCoreTemplate(code) ? (CORE_REQUIRED_VARIABLES[code] ?? []) : []);

/** Biến dùng được theo nhóm; mẫu tùy chỉnh dùng ở bước Thông báo của quy trình nên có biến của tờ trình */
const VARIABLES_BY_CATEGORY: Record<EmailTemplateCategory, TemplateVariable[]> = {
  [EmailTemplateCategory.Approval]: TEMPLATE_VARIABLES,
  [EmailTemplateCategory.Custom]: TEMPLATE_VARIABLES,
  ...CORE_TEMPLATE_VARIABLES,
};

/** Tiêu đề + nội dung — để kiểm tra biến */
const templateText = (tpl: EmailTemplateBody) => `${tpl.subject} ${tpl.body}`;

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
    const system = DEFAULT_TEMPLATES.map((tpl) => {
      const row = byCode.get(tpl.code);
      return row ? this.view(row) : this.defaultView(tpl);
    });
    const custom = rows.filter((r) => !isBuiltIn(r.code)).map((r) => this.view(r));
    return [...system, ...custom];
  }

  async getTemplate(code: string): Promise<EmailTemplateView> {
    const row = await this.repo.findOne({ code, deleted: { $ne: true } });
    if (row) return this.view(row);
    const tpl = defaultOf(code);
    if (tpl) return this.defaultView(tpl);
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
    this.assertRequiredVariables(code, data);
    const row = await this.repo.findOne({ code });
    if (row) {
      this.em.assign(row, { ...data, deleted: false, ...this.getDefaultValuesForUpdate() });
      await this.em.flush();
      return this.view(row);
    }
    if (!isBuiltIn(code)) throw new NotFoundException("Email template not found");
    return this.view(await this.addOne({ code, ...data, description: data.description ?? undefined }));
  }

  /** Xoá mẫu tùy chỉnh; với mẫu hệ thống = khôi phục nội dung mặc định */
  async deleteTemplate(code: string) {
    const row = await this.repo.findOne({ code, deleted: { $ne: true } });
    if (!row) {
      if (isBuiltIn(code)) return { code, reset: true };
      throw new NotFoundException("Email template not found");
    }
    if (isBuiltIn(code)) {
      await this.em.removeAndFlush(row);
      return { code, reset: true };
    }
    await this.remove(row.id);
    return { code, reset: false };
  }

  variables() {
    return VARIABLES_BY_CATEGORY;
  }

  /** Tên app, logo, link — để màn soạn vẽ header / footer giống email thật */
  brand() {
    return { appName: ENV.APP_NAME, logoUrl: brandVariables()["app.logo"], appLink: ENV.FRONTEND_URL };
  }

  /** Nội dung khởi đầu khi tạo mẫu tùy chỉnh */
  starter() {
    return { body: CUSTOM_TEMPLATE_STARTER };
  }

  /**
   * Xem trước với dữ liệu mẫu theo nhóm của `code` (không có = mẫu tùy chỉnh); trả về các biến không tồn tại
   * để cảnh báo
   */
  preview(template: EmailTemplateBody, code?: string) {
    const category = code ? templateCategory(code) : EmailTemplateCategory.Custom;
    const variables = VARIABLES_BY_CATEGORY[category];
    const known = new Set(variables.map((v) => v.key));
    const withPayload = category === EmailTemplateCategory.Approval || category === EmailTemplateCategory.Custom;
    const unknown = usedVariables(templateText(template)).filter((key) => !known.has(key) && !(withPayload && key.startsWith("payload.")));
    const vars = {
      ...toSampleVariables(variables),
      ...(withPayload && { "request.link": frontendUrl(FrontendPath.ApprovalRequests, "preview") }),
    };
    return { ...renderEmail(template, vars), unknownVariables: unknown };
  }

  /** Mẫu OTP / mật khẩu mới phải còn biến mang mã — xoá mất thì email gửi đi vô dụng */
  private assertRequiredVariables(code: string, data: UpdateEmailTemplateDto) {
    const used = new Set(usedVariables(templateText(data)));
    const missing = requiredVariablesOf(code).filter((key) => !used.has(key));
    if (missing.length) throw new BadRequestException(`Template must contain ${missing.map((key) => `{{${key}}}`).join(", ")}`);
  }

  private defaultView(tpl: EmailTemplateContent): EmailTemplateView {
    return {
      ...tpl,
      category: templateCategory(tpl.code),
      system: true,
      customized: false,
      requiredVariables: requiredVariablesOf(tpl.code),
    };
  }

  private view(row: EmailTemplateEntity): EmailTemplateView {
    const system = isBuiltIn(row.code);
    return {
      code: row.code,
      name: row.name,
      subject: row.subject,
      body: row.body,
      description: row.description,
      category: templateCategory(row.code),
      system,
      customized: system,
      requiredVariables: requiredVariablesOf(row.code),
      updatedAt: row.updatedAt,
    };
  }
}
