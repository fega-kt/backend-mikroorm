import { type NotificationType } from "@core-service/entities/notification";

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
  /** Số ngày còn lại tới lúc tự khóa; không có khi tính năng tự khóa tắt */
  daysLeft?: number;
  queueId: string;
  userId: string;
}

export interface AccountLockedMessage {
  /** Số ngày không hoạt động lúc bị khóa */
  days: number;
  queueId: string;
  userId: string;
}
