export const RABBITMQ_EXCHANGE = {
  NOTIFICATION: "notification",
  NOTIFICATION_DLX: "notification.dlx",
} as const;

export const RABBITMQ_QUEUES = {
  NOTIFICATION_EMAIL_INACTIVE_REMINDER: "notification.email.inactive-reminder",
  NOTIFICATION_EMAIL_INACTIVE_REMINDER_DLQ: "notification.email.inactive-reminder.dlq",
} as const;
