import { MikroORM } from "@mikro-orm/core";
import { ActivityLogQueueService } from "@core-service/services/activity-log-queue/activity-log-queue.service";
import { AppSettingEntity, AppSettingType } from "@core-service/entities/app-setting";
import { parseValuePositiveInt } from "@common/utils/parse-value.util";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { NotificationEntity, NotificationType } from "@core-service/entities/notification";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { UserEntity } from "@core-service/entities/user";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

@Injectable()
export class InactiveUserReminderService {
  private readonly logger = new Logger(InactiveUserReminderService.name);

  constructor(
    private readonly orm: MikroORM,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    private readonly rabbitmq: RabbitMQService,
    private readonly activityLogQueueService: ActivityLogQueueService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendInactiveReminders() {
    this.logger.log("Running inactive user reminder job...");
    const em = this.orm.em.fork();
    const setting = await em.findOne(AppSettingEntity, { key: AppSettingType.INACTIVE_DAYS_THRESHOLD, deleted: { $ne: true } });
    const days = parseValuePositiveInt(setting?.value) ?? 7;

    const users = await em.find(UserEntity, { deleted: { $ne: true }, isActive: true }, { fields: ["id", "fullName"] });
    if (!users.length) {
      this.logger.log("No active users found, skipping inactive reminder job");
      return;
    }

    const activeFlags = await Promise.all(users.map((u) => this.cache.get<string>(`user:last-active:${u.id}`)));
    const now = Date.now();
    const thresholdMs = days * 24 * 60 * 60 * 1000;
    const inactiveUsers = users.filter((_, i) => {
      const lastActive = activeFlags[i];
      if (!lastActive) return true;
      return now - Number(lastActive) >= thresholdMs;
    });

    if (!inactiveUsers.length) {
      this.logger.log("All users are active, no inactive reminder needed");
      return;
    }
    this.logger.log(`Found ${inactiveUsers.length} inactive user(s) to notify`);

    await this.createInAppNotifications(
      inactiveUsers.map((u) => u.id),
      days,
    );

    if (!this.rabbitmq.isConnected) {
      this.logger.warn("RabbitMQ not connected, skipping inactive reminder emails");
      return;
    }

    for (const user of inactiveUsers) {
      const msg = { days };
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

  /** Tạo noti in-app — bỏ qua user còn noti nhắc nhở chưa đọc để không tạo trùng mỗi ngày */
  private async createInAppNotifications(userIds: string[], days: number) {
    const em = this.orm.em.fork();
    const existing = await em.find(
      NotificationEntity,
      { user: { $in: userIds }, type: NotificationType.LOGIN_INACTIVE_REMINDER, isRead: false, deleted: { $ne: true } },
      { fields: ["user"] },
    );
    const notifiedIds = new Set(existing.map((n) => n.user.id));
    const targetIds = userIds.filter((id) => !notifiedIds.has(id));
    if (!targetIds.length) return;

    const system = em.getReference(UserEntity, SYSTEM_USER_ID);
    // không gắn ref — noti này không trỏ tới bản ghi nào, bấm vào chỉ đánh dấu đã đọc
    for (const userId of targetIds) {
      em.create(NotificationEntity, {
        user: em.getReference(UserEntity, userId),
        type: NotificationType.LOGIN_INACTIVE_REMINDER,
        data: { days },
        isRead: false,
        createdBy: system,
        updatedBy: system,
      });
    }
    await em.flush();
    this.logger.log(`Created in-app inactive reminder for ${targetIds.length} user(s)`);
  }
}
