import { MikroORM } from "@mikro-orm/core";
import { ActivityLogQueueService } from "@core-service/services/activity-log-queue/activity-log-queue.service";
import { AppSettingEntity, AppSettingType } from "@core-service/entities/app-setting";
import { parseValuePositiveInt } from "@common/utils/parse-value.util";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { NotificationEntity, NotificationType } from "@core-service/entities/notification";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { UserEntity } from "@core-service/entities/user";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { LastActiveBackfillService } from "./last-active-backfill.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class InactiveUserReminderService {
  private readonly logger = new Logger(InactiveUserReminderService.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly rabbitmq: RabbitMQService,
    private readonly activityLogQueueService: ActivityLogQueueService,
    private readonly lastActiveBackfill: LastActiveBackfillService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendInactiveReminders() {
    this.logger.log("Running inactive user reminder job...");
    const em = this.orm.em.fork();
    const setting = await em.findOne(AppSettingEntity, { key: AppSettingType.INACTIVE_DAYS_THRESHOLD, deleted: { $ne: true } });
    const thresholdDays = parseValuePositiveInt(setting?.value) ?? 7;
    const lockSetting = await em.findOne(AppSettingEntity, { key: AppSettingType.INACTIVE_LOCK_DAYS, deleted: { $ne: true } });
    const configuredLockDays = parseValuePositiveInt(lockSetting?.value);
    const lockDays = configuredLockDays && configuredLockDays > thresholdDays ? configuredLockDays : undefined;

    const users = await em.find(
      UserEntity,
      { deleted: { $ne: true }, isActive: true },
      { fields: ["id", "fullName", "createdAt", "authId", "lastActiveAt"] },
    );
    if (!users.length) {
      this.logger.log("No active users found, skipping inactive reminder job");
      return;
    }

    await this.lastActiveBackfill.backfill(users);

    const now = Date.now();
    // Số ngày thực tế không online của từng user (không phải ngưỡng) → hôm nay báo 7, mai báo 8...
    // Chưa từng online (lastActiveAt null) thì tính từ lúc tạo tài khoản
    // Tự khóa bật: user đã tới hạn khóa (≥ lockDays) không nhắc nữa — cron khóa (chạy trước cron này) lo, và mail nhắc không còn "số ngày còn lại" để ghi
    const inactiveUsers = users
      .map((user) => ({
        id: user.id,
        fullName: user.fullName,
        days: Math.floor((now - (user.lastActiveAt ?? user.createdAt).getTime()) / DAY_MS),
      }))
      .filter((user) => user.days >= thresholdDays && (!lockDays || user.days < lockDays));

    if (!inactiveUsers.length) {
      this.logger.log("All users are active, no inactive reminder needed");
      return;
    }
    this.logger.log(`Found ${inactiveUsers.length} inactive user(s) to notify`);

    await this.createInAppNotifications(inactiveUsers);

    if (!this.rabbitmq.isConnected) {
      this.logger.warn("RabbitMQ not connected, skipping inactive reminder emails");
      return;
    }

    for (const user of inactiveUsers) {
      // Số ngày còn lại tới lúc khóa (chỉ khi tự khóa đang bật); luôn ≥ 1 vì user tới hạn đã bị lọc ở trên
      const daysLeft = lockDays ? lockDays - user.days : undefined;
      const msg = { days: user.days, ...(daysLeft && { daysLeft }) };
      this.logger.log(`Queuing inactive reminder email for user ${user.id} (${user.fullName})`);
      const queueItem = await this.activityLogQueueService.create({
        userId: user.id,
        type: NotificationType.LOGIN_INACTIVE_REMINDER,
        payload: msg,
      });

      await this.rabbitmq.publish(RABBITMQ_EXCHANGE.NOTIFICATION, RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER, {
        ...msg,
        queueId: queueItem.id,
        userId: user.id,
      });
    }

    this.logger.log(`Queued inactive reminder email for ${inactiveUsers.length} user(s)`);
  }

  /**
   * Tạo noti in-app với số ngày mới nhất. Noti nhắc cũ chưa đọc được thay thế (xoá mềm + tạo mới) chứ không chồng thêm:
   * mỗi user chỉ có 1 noti nhắc, luôn nằm đầu danh sách (cursor theo id uuidv7), số chưa đọc trên chuông không tăng.
   */
  private async createInAppNotifications(users: Array<{ id: string; days: number }>) {
    const em = this.orm.em.fork();
    const system = em.getReference(UserEntity, SYSTEM_USER_ID);

    await em.nativeUpdate(
      NotificationEntity,
      {
        user: { $in: users.map((u) => u.id) },
        type: NotificationType.LOGIN_INACTIVE_REMINDER,
        isRead: false,
        deleted: { $ne: true },
      },
      { deleted: true, updatedBy: system },
    );

    // không gắn ref — noti này không trỏ tới bản ghi nào, bấm vào chỉ đánh dấu đã đọc
    for (const user of users) {
      em.create(NotificationEntity, {
        user: em.getReference(UserEntity, user.id),
        type: NotificationType.LOGIN_INACTIVE_REMINDER,
        data: { days: user.days },
        isRead: false,
        createdBy: system,
        updatedBy: system,
      });
    }
    await em.flush();
    this.logger.log(`Created in-app inactive reminder for ${users.length} user(s)`);
  }
}
