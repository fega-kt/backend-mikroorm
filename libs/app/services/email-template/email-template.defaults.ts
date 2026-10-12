/** Mã mẫu email hệ thống — mỗi sự kiện của tờ trình dùng một mẫu */
export enum SystemEmailTemplate {
  StepPending = "approval.step_pending",
  Approved = "approval.approved",
  Rejected = "approval.rejected",
  Returned = "approval.returned",
  Cancelled = "approval.cancelled",
  Reminder = "approval.reminder",
  Escalated = "approval.escalated",
  /** Mặc định của bước Thông báo khi không chọn mẫu riêng */
  Notify = "approval.notify",
}

export interface EmailTemplateContent {
  code: string;
  name: string;
  subject: string;
  body: string;
}

/**
 * Nội dung mặc định của mẫu hệ thống. Admin sửa ở màn Mẫu email → lưu thành bản ghi đè trong DB;
 * "Khôi phục mặc định" xoá bản ghi đè để quay về nội dung ở đây.
 */
export const SYSTEM_EMAIL_TEMPLATES: Record<SystemEmailTemplate, EmailTemplateContent> = {
  [SystemEmailTemplate.StepPending]: {
    code: SystemEmailTemplate.StepPending,
    name: "Tờ trình chờ duyệt",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} đang chờ bạn duyệt",
    body: "<p>Xin chào {{recipient.name}},</p><p>Bạn có một tờ trình cần duyệt ở bước <strong>{{step.name}}</strong>.</p><p><strong>{{request.code}}</strong> {{request.title}} · {{request.type}}<br>Người trình: {{request.requester}} ({{request.department}}) · Độ ưu tiên: {{request.priority}}</p>",
  },
  [SystemEmailTemplate.Approved]: {
    code: SystemEmailTemplate.Approved,
    name: "Tờ trình đã được duyệt",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} đã được duyệt",
    body: "<p>Xin chào {{recipient.name}},</p><p>Tờ trình <strong>{{request.code}}</strong> {{request.title}} của bạn đã được duyệt xong.</p>",
  },
  [SystemEmailTemplate.Rejected]: {
    code: SystemEmailTemplate.Rejected,
    name: "Tờ trình bị từ chối",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} bị từ chối",
    body: "<p>Xin chào {{recipient.name}},</p><p>Tờ trình <strong>{{request.code}}</strong> {{request.title}} bị {{actor.name}} từ chối ở bước <strong>{{step.name}}</strong>.</p><p>Lý do: {{comment}}</p>",
  },
  [SystemEmailTemplate.Returned]: {
    code: SystemEmailTemplate.Returned,
    name: "Tờ trình được trả lại",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} được trả lại để bổ sung",
    body: "<p>Xin chào {{recipient.name}},</p><p>Tờ trình <strong>{{request.code}}</strong> {{request.title}} được {{actor.name}} trả lại ở bước <strong>{{step.name}}</strong>. Vui lòng bổ sung và gửi lại.</p><p>Nội dung cần bổ sung: {{comment}}</p>",
  },
  [SystemEmailTemplate.Cancelled]: {
    code: SystemEmailTemplate.Cancelled,
    name: "Tờ trình đã bị hủy",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} đã bị hủy",
    body: "<p>Xin chào {{recipient.name}},</p><p>{{request.requester}} đã hủy tờ trình <strong>{{request.code}}</strong> {{request.title}}, bạn không cần duyệt nữa.</p>",
  },
  [SystemEmailTemplate.Reminder]: {
    code: SystemEmailTemplate.Reminder,
    name: "Nhắc duyệt quá hạn",
    subject: "[Nhắc duyệt] {{request.code}} – {{request.title}} đã quá hạn",
    body: "<p>Xin chào {{recipient.name}},</p><p>Tờ trình <strong>{{request.code}}</strong> {{request.title}} đang chờ bạn duyệt ở bước <strong>{{step.name}}</strong> đã quá hạn xử lý.</p>",
  },
  [SystemEmailTemplate.Escalated]: {
    code: SystemEmailTemplate.Escalated,
    name: "Tờ trình được chuyển cấp",
    subject: "[Phê duyệt] {{request.code}} – {{request.title}} được chuyển cấp cho bạn",
    body: "<p>Xin chào {{recipient.name}},</p><p>Bước <strong>{{step.name}}</strong> của tờ trình <strong>{{request.code}}</strong> {{request.title}} quá hạn nên được chuyển cho bạn duyệt.</p>",
  },
  [SystemEmailTemplate.Notify]: {
    code: SystemEmailTemplate.Notify,
    name: "Thông báo theo quy trình (mặc định)",
    subject: "[Thông báo] {{request.code}} – {{request.title}}",
    body:
      "<p>Xin chào {{recipient.name}},</p>" +
      "<p>Bạn nhận được thông báo về tờ trình <strong>{{request.code}}</strong> {{request.title}}.</p>" +
      "<p><strong>Nội dung:</strong> {{message}}</p>" +
      "<p>Loại: {{request.type}} · Người trình: {{request.requester}} · Đơn vị: {{request.department}}</p>",
  },
};

export const isSystemTemplate = (code: string): code is SystemEmailTemplate => code in SYSTEM_EMAIL_TEMPLATES;
