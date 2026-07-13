import { MikroORM } from "@mikro-orm/core";
import { ActivityLogQueueService } from "@modules/activity-log-queue/service/activity-log-queue.service";
import { AppSettingEntity, AppSettingType } from "@modules/app-setting/entity/app-setting.entity";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import { NotificationType } from "@modules/notification/entity/notification.entity";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { UserEntity } from "@modules/user/entity/user.entity";
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

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendInactiveReminders() {
    if (!this.rabbitmq.isConnected) return;

    this.logger.log("Running inactive user reminder job...");
    const em = this.orm.em.fork();
    const setting = await em.findOne(AppSettingEntity, { key: AppSettingType.INACTIVE_DAYS_THRESHOLD, deleted: { $ne: true } });
    const days = setting ? Number(setting.value) || 7 : 7;

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
}
