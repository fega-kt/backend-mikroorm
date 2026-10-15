import type { EntityManager } from "@mikro-orm/core";
import { brandVariables, buildEmailBody, type EmailLayout, renderEmail, type TemplateVariable } from "./email-template.render";
import { EmailTemplateCategory, type EmailTemplateContent, findEmailTemplate } from "./email-template.resolve";

/** Mã mẫu email của hệ thống (ngoài tờ trình): đăng nhập, mật khẩu, nhắc nhở */
export enum CoreEmailTemplate {
  LoginOtp = "auth.login_otp",
  ForgotPasswordOtp = "auth.forgot_password_otp",
  NewPassword = "auth.new_password",
  AccountCreated = "auth.account_created",
  PasswordChanged = "auth.password_changed",
  InactiveReminder = "system.inactive_reminder",
}

/** Biến có ở mọi email (tự điền) — giá trị lấy từ env (APP_NAME, FRONTEND_URL, APP_LOGO_URL) */
export const BRAND_TEMPLATE_VARIABLES: TemplateVariable[] = Object.entries(brandVariables()).map(([key, sample]) => ({ key, sample }));

const USER_VARIABLES: TemplateVariable[] = [
  { key: "user.name", sample: "Nguyễn Văn A" },
  { key: "user.email", sample: "a.nguyen@example.com" },
  ...BRAND_TEMPLATE_VARIABLES,
];

/** Biến của từng nhóm mẫu hệ thống */
export const CORE_TEMPLATE_VARIABLES: Record<EmailTemplateCategory.Auth | EmailTemplateCategory.System, TemplateVariable[]> = {
  [EmailTemplateCategory.Auth]: [
    ...USER_VARIABLES,
    { key: "otp.code", sample: "482913" },
    { key: "otp.expiresInMinutes", sample: "5" },
    { key: "password.new", sample: "Xk7pQ2mzR9ab" },
    { key: "time", sample: "15/10/2026, 09:30:00" },
    { key: "client.ip", sample: "203.113.10.25" },
    { key: "client.device", sample: "Chrome · Windows" },
  ],
  [EmailTemplateCategory.System]: [...USER_VARIABLES, { key: "inactive.days", sample: "30" }],
};

/** Biến bắt buộc phải còn trong mẫu (tiêu đề hoặc nội dung) — thiếu thì email mất ý nghĩa */
export const CORE_REQUIRED_VARIABLES: Partial<Record<CoreEmailTemplate, string[]>> = {
  [CoreEmailTemplate.LoginOtp]: ["otp.code"],
  [CoreEmailTemplate.ForgotPasswordOtp]: ["otp.code"],
  [CoreEmailTemplate.NewPassword]: ["password.new"],
};

const GREETING = "<p>Xin chào <strong>{{user.name}}</strong>,</p>";

const requestInfo: EmailLayout["details"] = {
  title: "Thông tin yêu cầu",
  rows: [
    ["IP", "{{client.ip}}"],
    ["Thiết bị", "{{client.device}}"],
    ["Thời gian", "{{time}}"],
  ],
  note: "Nếu không phải bạn thực hiện, hãy bỏ qua email này hoặc liên hệ quản trị viên.",
};

/**
 * Nội dung mặc định (toàn bộ email). Admin sửa ở màn Mẫu email → lưu thành bản ghi đè trong DB;
 * "Khôi phục mặc định" xoá bản ghi đè để quay về nội dung ở đây.
 */
export const CORE_EMAIL_TEMPLATES: Record<CoreEmailTemplate, EmailTemplateContent> = {
  [CoreEmailTemplate.LoginOtp]: {
    code: CoreEmailTemplate.LoginOtp,
    name: "Mã đăng nhập (OTP)",
    subject: "Mã đăng nhập của bạn: {{otp.code}}",
    body: buildEmailBody(
      `${GREETING}<p>Dùng mã dưới đây để đăng nhập vào tài khoản của bạn. Không chia sẻ mã này với bất kỳ ai, kể cả quản trị viên.</p>`,
      {
        icon: "🔑",
        title: "Mã đăng nhập",
        highlight: { label: "Mã đăng nhập", value: "{{otp.code}}", code: true, note: "Hết hạn sau {{otp.expiresInMinutes}} phút" },
        details: requestInfo,
      },
    ),
  },
  [CoreEmailTemplate.ForgotPasswordOtp]: {
    code: CoreEmailTemplate.ForgotPasswordOtp,
    name: "Mã xác nhận quên mật khẩu",
    subject: "Mã xác nhận đặt lại mật khẩu: {{otp.code}}",
    body: buildEmailBody(
      `${GREETING}<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>{{user.email}}</strong>. Nhập mã dưới đây để tiếp tục.</p>`,
      {
        tone: "warning",
        icon: "🔒",
        title: "Đặt lại mật khẩu",
        highlight: { label: "Mã xác nhận", value: "{{otp.code}}", code: true, note: "Hết hạn sau {{otp.expiresInMinutes}} phút" },
        details: requestInfo,
      },
    ),
  },
  [CoreEmailTemplate.NewPassword]: {
    code: CoreEmailTemplate.NewPassword,
    name: "Mật khẩu mới",
    subject: "Mật khẩu mới của bạn",
    body: buildEmailBody(
      `${GREETING}<p>Mật khẩu của tài khoản <strong>{{user.email}}</strong> đã được đặt lại. Hãy đăng nhập và đổi sang mật khẩu của riêng bạn ngay.</p>`,
      {
        icon: "🗝️",
        title: "Mật khẩu mới",
        highlight: { label: "Mật khẩu mới", value: "{{password.new}}" },
        button: { label: "Đăng nhập", link: "{{app.link}}" },
      },
    ),
  },
  [CoreEmailTemplate.AccountCreated]: {
    code: CoreEmailTemplate.AccountCreated,
    name: "Tài khoản đã được tạo",
    subject: "Tài khoản của bạn đã được tạo",
    body: buildEmailBody(
      `${GREETING}<p>Tài khoản của bạn đã sẵn sàng. Đăng nhập bằng email <strong>{{user.email}}</strong> để bắt đầu sử dụng.</p>`,
      {
        tone: "success",
        icon: "✓",
        title: "Chào mừng bạn đến với {{app.name}}",
        button: { label: "Đăng nhập ngay", link: "{{app.link}}" },
      },
    ),
  },
  [CoreEmailTemplate.PasswordChanged]: {
    code: CoreEmailTemplate.PasswordChanged,
    name: "Mật khẩu đã được thay đổi",
    subject: "Mật khẩu của bạn đã được thay đổi",
    body: buildEmailBody(
      `${GREETING}<p>Mật khẩu tài khoản <strong>{{user.email}}</strong> vừa được thay đổi. Nếu đây là bạn, không cần làm gì thêm.</p>`,
      { tone: "danger", icon: "!", title: "Mật khẩu đã được thay đổi", details: requestInfo },
    ),
  },
  [CoreEmailTemplate.InactiveReminder]: {
    code: CoreEmailTemplate.InactiveReminder,
    name: "Nhắc đăng nhập (lâu không hoạt động)",
    subject: "Đã {{inactive.days}} ngày bạn chưa đăng nhập",
    body: buildEmailBody(
      `${GREETING}<p>Bạn chưa đăng nhập trong <strong>{{inactive.days}} ngày</strong> qua. Có thể có tờ trình hoặc công việc đang chờ bạn xử lý.</p>`,
      { icon: "👋", title: "Lâu rồi không gặp!", button: { label: "Mở {{app.name}}", link: "{{app.link}}" } },
    ),
  },
};

export const isCoreTemplate = (code: string): code is CoreEmailTemplate => code in CORE_EMAIL_TEMPLATES;

/** Nội dung email sẵn sàng gửi: bản đè trong DB → mặc định */
export async function renderCoreEmail(em: EntityManager, code: CoreEmailTemplate, vars: Record<string, string | undefined>) {
  return renderEmail((await findEmailTemplate(em, code)) ?? CORE_EMAIL_TEMPLATES[code], vars);
}
