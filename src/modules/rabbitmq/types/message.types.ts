import { type NotificationType } from "@modules/notification/entity/notification.entity";

export interface NotificationEmailMessage {
  notificationId?: string;
  queueId?: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  variables?: Record<string, string>;
}

export interface InactiveReminderMessage {
  days: number;
  queueId: string;
  userId: string;
}
