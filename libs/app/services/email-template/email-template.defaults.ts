import { buildEmailBody, type EmailLayout, type EmailTone } from "@core-service/services/email-template/email-template.render";
import type { EmailTemplateContent } from "@core-service/services/email-template/email-template.resolve";

export type { EmailTemplateContent };

/** Mã mẫu email hệ thống — mỗi sự kiện của tờ trình dùng một mẫu */
export enum SystemEmailTemplate {
  StepPending = "approval.step_pending",
  Approved = "approval.approved",
  Rejected = "approval.rejected",
  Returned = "approval.returned",
  Cancelled = "approval.cancelled",
  Reminder = "approval.reminder",
  Escalated = "approval.escalated",
  StepApproved = "approval.step_approved",
  Shared = "approval.shared",
  /** Mặc định của bước Thông báo khi không chọn mẫu riêng */
  Notify = "approval.notify",
}

/** Layout email tờ trình: tiêu đề lớn theo sự kiện + nút mở tờ trình */
const requestLayout = (tone: EmailTone, icon?: string, title?: string): EmailLayout => ({
  tone,
  icon,
  title,
  button: { label: "Xem tờ trình", link: "{{request.link}}" },
});

/**
 * Thông tin chung của tờ trình, mỗi thông tin một dòng (dễ đọc trên điện thoại); `extra` là các dòng thêm ở cuối
 */
const requestDetails = (...extra: string[]) =>
  `<p>${["Loại tờ trình: {{request.type}}", "Người trình: {{request.requester}}", "Đơn vị: {{request.department}}", ...extra].join("<br>")}</p>`;

const REQUEST_DETAILS = requestDetails();

/** Nội dung khởi đầu khi tạo mẫu tùy chỉnh (bước Thông báo của quy trình) */
export const CUSTOM_TEMPLATE_STARTER = buildEmailBody(
  "<p>Xin chào {{recipient.name}},</p>" +
    "<p>Bạn nhận được thông báo về tờ trình <strong>{{request.code}}</strong> {{request.title}}.</p>" +
    "<p>{{message}}</p>",
  requestLayout("brand", "🔔", "Thông báo về tờ trình"),
);

/**
 * Nội dung mặc định của mẫu hệ thống. Admin sửa ở màn Mẫu email → lưu thành bản ghi đè trong DB;
 * "Khôi phục mặc định" xoá bản ghi đè để quay về nội dung ở đây.
 */
export const SYSTEM_EMAIL_TEMPLATES: Record<SystemEmailTemplate, EmailTemplateContent> = {
  [SystemEmailTemplate.StepPending]: {
    code: SystemEmailTemplate.StepPending,
    name: "Tờ trình chờ duyệt",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} đang chờ bạn duyệt",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p>" +
        "<p>Bạn có một tờ trình cần duyệt ở bước <strong>{{step.name}}</strong>.</p>" +
        "<p><strong>{{request.code}}</strong> {{request.title}}</p>" +
        requestDetails("Độ ưu tiên: {{request.priority}}"),
      requestLayout("brand", "📄", "Tờ trình chờ bạn duyệt"),
    ),
  },
  [SystemEmailTemplate.Approved]: {
    code: SystemEmailTemplate.Approved,
    name: "Tờ trình đã được duyệt",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} đã được duyệt",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p><p>Tờ trình <strong>{{request.code}}</strong> {{request.title}} của bạn đã được duyệt xong.</p>",
      requestLayout("success", "✓", "Tờ trình đã được duyệt"),
    ),
  },
  [SystemEmailTemplate.StepApproved]: {
    code: SystemEmailTemplate.StepApproved,
    name: "Một bước đã được duyệt",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}}: bước {{step.name}} đã được duyệt",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p>" +
        "<p>Bước <strong>{{step.name}}</strong> của tờ trình <strong>{{request.code}}</strong> {{request.title}} đã được {{actor.name}} duyệt.</p>" +
        "<p>Ý kiến: {{comment}}</p><p>{{message}}</p>" +
        REQUEST_DETAILS,
      requestLayout("success", "✓", "Một bước đã được duyệt"),
    ),
  },
  [SystemEmailTemplate.Rejected]: {
    code: SystemEmailTemplate.Rejected,
    name: "Tờ trình bị từ chối",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} bị từ chối",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p><p>Tờ trình <strong>{{request.code}}</strong> {{request.title}} bị {{actor.name}} từ chối ở bước <strong>{{step.name}}</strong>.</p><p>Lý do: {{comment}}</p>",
      requestLayout("danger", "✕", "Tờ trình bị từ chối"),
    ),
  },
  [SystemEmailTemplate.Returned]: {
    code: SystemEmailTemplate.Returned,
    name: "Tờ trình được trả lại",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} được trả lại để bổ sung",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p><p>Tờ trình <strong>{{request.code}}</strong> {{request.title}} được {{actor.name}} trả lại ở bước <strong>{{step.name}}</strong>. Vui lòng bổ sung và gửi lại.</p><p>Nội dung cần bổ sung: {{comment}}</p>",
      requestLayout("warning", "↩", "Tờ trình được trả lại"),
    ),
  },
  [SystemEmailTemplate.Cancelled]: {
    code: SystemEmailTemplate.Cancelled,
    name: "Tờ trình đã bị hủy",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} đã bị hủy",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p><p>{{request.requester}} đã hủy tờ trình <strong>{{request.code}}</strong> {{request.title}}, bạn không cần duyệt nữa.</p>",
      requestLayout("danger", "⊘", "Tờ trình đã bị hủy"),
    ),
  },
  [SystemEmailTemplate.Reminder]: {
    code: SystemEmailTemplate.Reminder,
    name: "Nhắc duyệt quá hạn",
    subject: "[Nhắc duyệt] {{request.code}} – {{request.title}} đã quá hạn",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p><p>Tờ trình <strong>{{request.code}}</strong> {{request.title}} đang chờ bạn duyệt ở bước <strong>{{step.name}}</strong> đã quá hạn xử lý.</p>",
      requestLayout("warning", "⏰", "Tờ trình đã quá hạn duyệt"),
    ),
  },
  [SystemEmailTemplate.Escalated]: {
    code: SystemEmailTemplate.Escalated,
    name: "Tờ trình được chuyển cấp",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} được chuyển cấp cho bạn",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p><p>Bước <strong>{{step.name}}</strong> của tờ trình <strong>{{request.code}}</strong> {{request.title}} quá hạn nên được chuyển cho bạn duyệt.</p>",
      requestLayout("warning", "⇪", "Tờ trình được chuyển cấp cho bạn"),
    ),
  },
  [SystemEmailTemplate.Shared]: {
    code: SystemEmailTemplate.Shared,
    name: "Tờ trình được chia sẻ",
    subject: "[Phê duyệt] {{actor.name}} chia sẻ tờ trình {{request.code}} – {{request.title}} với bạn",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p>" +
        "<p>{{actor.name}} đã chia sẻ với bạn tờ trình <strong>{{request.code}}</strong> {{request.title}}. Bạn có thể xem nhưng không duyệt hay sửa được.</p>" +
        "<p>Lời nhắn: {{message}}</p>" +
        REQUEST_DETAILS,
      requestLayout("brand", "✉️", "Tờ trình được chia sẻ với bạn"),
    ),
  },
  [SystemEmailTemplate.Notify]: {
    code: SystemEmailTemplate.Notify,
    name: "Thông báo theo quy trình (mặc định)",
    subject: "[Thông báo] {{request.code}} – {{request.title}}",
    body: buildEmailBody(
      "<p>Xin chào {{recipient.name}},</p>" +
        "<p>Bạn nhận được thông báo về tờ trình <strong>{{request.code}}</strong> {{request.title}}.</p>" +
        "<p><strong>Nội dung:</strong> {{message}}</p>" +
        REQUEST_DETAILS,
      requestLayout("brand", "🔔", "Thông báo về tờ trình"),
    ),
  },
};

export const isSystemTemplate = (code: string): code is SystemEmailTemplate => code in SYSTEM_EMAIL_TEMPLATES;
