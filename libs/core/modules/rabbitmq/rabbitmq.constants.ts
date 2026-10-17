export const RABBITMQ_EXCHANGE = {
  NOTIFICATION: "notification",
  NOTIFICATION_DLX: "notification.dlx",
  /** topic exchange cho event của module phê duyệt (routing key: approval.<type>) */
  APPROVAL: "approval",
  /** direct exchange cho việc xử lý tệp sau khi upload (routing key = tên queue) */
  ATTACHMENT: "attachment",
} as const;

export const RABBITMQ_QUEUES = {
  NOTIFICATION_EMAIL_INACTIVE_REMINDER: "notification.email.inactive-reminder",
  NOTIFICATION_EMAIL_INACTIVE_REMINDER_DLQ: "notification.email.inactive-reminder.dlq",
  /** app-jobs: gửi email theo event phê duyệt */
  APPROVAL_EMAIL: "approval.email",
  APPROVAL_EMAIL_DLQ: "approval.email.dlq",
  /** core-jobs: tạo bản xem tối ưu cho PDF vừa upload */
  ATTACHMENT_PDF_PREVIEW: "attachment.pdf-preview",
  ATTACHMENT_PDF_PREVIEW_DLQ: "attachment.pdf-preview.dlq",
} as const;
