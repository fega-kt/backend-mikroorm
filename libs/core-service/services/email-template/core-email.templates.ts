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
  AccountLocked = "system.account_locked",
  ExportReady = "system.export_ready",
  ExportFailed = "system.export_failed",
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
  [EmailTemplateCategory.System]: [
    ...USER_VARIABLES,
    { key: "inactive.days", sample: "30" },
    { key: "lock.daysLeft", sample: "23" },
    { key: "export.name", sample: "Tờ-trình-của-tôi-20261107-1530.zip" },
    { key: "export.rows", sample: "120.000" },
    { key: "export.expireDays", sample: "7" },
    { key: "export.note", sample: "File được đính kèm trong email này." },
    { key: "export.error", sample: "Quá thời gian xử lý" },
    { key: "export.link", sample: "https://app.example.com/export-history" },
  ],
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
    name: "Nhắc nhở đăng nhập",
    subject: "Đã {{inactive.days}} ngày bạn chưa đăng nhập",
    body: buildEmailBody(
      `${GREETING}<p>Bạn đã không đăng nhập trong <strong>{{inactive.days}} ngày</strong> qua. Trong thời gian này, có thể có các tờ trình hoặc công việc đang chờ bạn xem xét và xử lý.</p><p><strong>Tài khoản của bạn sẽ bị khóa sau {{lock.daysLeft}} ngày nữa.</strong> Vui lòng đăng nhập sớm để tiếp tục sử dụng hệ thống và tránh gián đoạn công việc.</p>`,
      { icon: "👋", title: "Lâu rồi không gặp!", button: { label: "Mở {{app.name}}", link: "{{app.link}}" } },
    ),
  },
  [CoreEmailTemplate.AccountLocked]: {
    code: CoreEmailTemplate.AccountLocked,
    name: "Tài khoản bị khóa",
    subject: "Tài khoản của bạn đã bị khóa do không hoạt động",
    body: buildEmailBody(
      `${GREETING}<p>Tài khoản <strong>{{user.email}}</strong> đã bị khóa vì không có hoạt động trong <strong>{{inactive.days}} ngày</strong>.</p><p>Chữ ký số của bạn (nếu có) đã bị thu hồi. Để sử dụng lại, hãy liên hệ quản trị viên để mở khóa tài khoản, sau đó đăng ký lại chữ ký số.</p>`,
      { tone: "danger", icon: "!", title: "Tài khoản đã bị khóa" },
    ),
  },
  [CoreEmailTemplate.ExportReady]: {
    code: CoreEmailTemplate.ExportReady,
    name: "File xuất Excel đã sẵn sàng",
    subject: "File xuất đã sẵn sàng: {{export.name}}",
    body: buildEmailBody(
      `${GREETING}<p>File <strong>{{export.name}}</strong> ({{export.rows}} dòng) đã được tạo xong.</p><p>{{export.note}}</p><p>File được giữ {{export.expireDays}} ngày kể từ lúc tạo.</p>`,
      { tone: "success", icon: "✓", title: "File xuất đã sẵn sàng", button: { label: "Mở lịch sử xuất", link: "{{export.link}}" } },
    ),
  },
  [CoreEmailTemplate.ExportFailed]: {
    code: CoreEmailTemplate.ExportFailed,
    name: "Xuất file Excel không thành công",
    subject: "Xuất file không thành công: {{export.name}}",
    body: buildEmailBody(`${GREETING}<p>Lượt xuất <strong>{{export.name}}</strong> không hoàn thành.</p><p>Lý do: {{export.error}}</p>`, {
      tone: "danger",
      icon: "!",
      title: "Xuất file không thành công",
      button: { label: "Mở lịch sử xuất", link: "{{export.link}}" },
    }),
  },
};

export const isCoreTemplate = (code: string): code is CoreEmailTemplate => code in CORE_EMAIL_TEMPLATES;

/** Nội dung email sẵn sàng gửi: bản đè trong DB → mặc định */
export async function renderCoreEmail(em: EntityManager, code: CoreEmailTemplate, vars: Record<string, string | undefined>) {
  return renderEmail((await findEmailTemplate(em, code)) ?? CORE_EMAIL_TEMPLATES[code], vars);
}
