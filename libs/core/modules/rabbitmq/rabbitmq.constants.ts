export const RABBITMQ_EXCHANGE = {
  NOTIFICATION: "notification",
  NOTIFICATION_DLX: "notification.dlx",
  /** topic exchange cho event của module phê duyệt (routing key: approval.<type>) */
  APPROVAL: "approval",
} as const;

export const RABBITMQ_QUEUES = {
  NOTIFICATION_EMAIL_INACTIVE_REMINDER: "notification.email.inactive-reminder",
  NOTIFICATION_EMAIL_INACTIVE_REMINDER_DLQ: "notification.email.inactive-reminder.dlq",
  /** app-jobs: gửi email theo event phê duyệt */
  APPROVAL_EMAIL: "approval.email",
  APPROVAL_EMAIL_DLQ: "approval.email.dlq",
} as const;
