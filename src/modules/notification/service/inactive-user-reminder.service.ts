import { MikroORM } from "@mikro-orm/core";
import { AppSettingEntity, AppSettingType } from "@modules/app-setting/entity/app-setting.entity";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import { UserEntity } from "@modules/user/entity/user.entity";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { NotificationEntity, NotificationType } from "../entity/notification.entity";

@Injectable()
export class InactiveUserReminderService {
  private readonly logger = new Logger(InactiveUserReminderService.name);

  constructor(
    private readonly orm: MikroORM,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendInactiveReminders() {
    this.logger.log("Running inactive user reminder job...");
    const em = this.orm.em.fork();
    const setting = await em.findOne(AppSettingEntity, { key: AppSettingType.INACTIVE_DAYS_THRESHOLD, deleted: { $ne: true } });
    const days = setting ? Number(setting.value) || 7 : 7;

    const users = await em.find(UserEntity, { deleted: { $ne: true }, isActive: true }, { fields: ["id", "fullName"] });

    if (!users.length) return;

    const activeFlags = await Promise.all(users.map((u) => this.cache.get<string>(`user:last-active:${u.id}`)));
    const inactiveUsers = users.filter((_, i) => !activeFlags[i]);

    if (!inactiveUsers.length) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const recentNotifs = await em.find(
      NotificationEntity,
      {
        user: { $in: inactiveUsers.map((u) => u.id) },
        type: NotificationType.LOGIN_INACTIVE_REMINDER,
        createdAt: { $gte: cutoff },
        deleted: { $ne: true },
      },
      { fields: ["id", "user"] },
    );

    const alreadyNotified = new Set(recentNotifs.map((n) => n.user.id));
    const toNotify = inactiveUsers.filter((u) => !alreadyNotified.has(u.id));

    if (!toNotify.length) return;

    for (const user of toNotify) {
      em.persist(
        em.create(NotificationEntity, {
          user: user.id,
          type: NotificationType.LOGIN_INACTIVE_REMINDER,
          title: "Bạn đã lâu không hoạt động",
          message: `Bạn chưa hoạt động trong ${days} ngày qua. Hãy quay lại hệ thống để cập nhật công việc.`,
          isRead: false,
        }),
      );
    }

    await em.flush();
    this.logger.log(`Sent inactive reminders to ${toNotify.length} user(s)`);
  }
}
