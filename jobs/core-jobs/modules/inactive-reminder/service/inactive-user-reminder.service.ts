import { MikroORM } from "@mikro-orm/core";
import { ActivityLogQueueService } from "@core-service/services/activity-log-queue/activity-log-queue.service";
import { AppSettingEntity, AppSettingType } from "@core-service/entities/app-setting";
import { parseValuePositiveInt } from "@common/utils/parse-value.util";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { NotificationEntity, NotificationType } from "@core-service/entities/notification";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { SupabaseAuthDbService } from "@modules/supabase/supabase-auth-db.service";
import { AuthCacheKey } from "@core-service/services/auth/auth.constants";
import { UserEntity } from "@core-service/entities/user";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class InactiveUserReminderService {
  private readonly logger = new Logger(InactiveUserReminderService.name);

  constructor(
    private readonly orm: MikroORM,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    private readonly rabbitmq: RabbitMQService,
    private readonly activityLogQueueService: ActivityLogQueueService,
    private readonly authDb: SupabaseAuthDbService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendInactiveReminders() {
    this.logger.log("Running inactive user reminder job...");
    const em = this.orm.em.fork();
    const setting = await em.findOne(AppSettingEntity, { key: AppSettingType.INACTIVE_DAYS_THRESHOLD, deleted: { $ne: true } });
    const thresholdDays = parseValuePositiveInt(setting?.value) ?? 7;

    const users = await em.find(
      UserEntity,
      { deleted: { $ne: true }, isActive: true },
      { fields: ["id", "fullName", "createdAt", "authId", "lastActiveAt"] },
    );
    if (!users.length) {
      this.logger.log("No active users found, skipping inactive reminder job");
      return;
    }

    await this.backfillLastActive(users);

    const now = Date.now();
    // Số ngày thực tế không online của từng user (không phải ngưỡng) → hôm nay báo 7, mai báo 8...
    // Chưa từng online (lastActiveAt null) thì tính từ lúc tạo tài khoản
    const inactiveUsers = users
      .map((user) => ({
        id: user.id,
        fullName: user.fullName,
        days: Math.floor((now - (user.lastActiveAt ?? user.createdAt).getTime()) / DAY_MS),
      }))
      .filter((user) => user.days >= thresholdDays);

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
      const msg = { days: user.days };
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
   * Điền lastActiveAt cho user chưa có (user cũ từ trước khi có cột): lấy mốc muộn nhất giữa key Redis cũ
   * (user:last-active, guard không còn ghi) và Supabase (auth.sessions, auth.users.last_sign_in_at).
   * Sau lần chạy đầu chỉ còn user chưa từng đăng nhập rơi vào đây. Không ghi đè giá trị guard vừa ghi.
   */
  private async backfillLastActive(users: Array<Pick<UserEntity, "id" | "authId" | "lastActiveAt">>) {
    const missing = users.filter((u) => !u.lastActiveAt);
    if (!missing.length) return;

    const [redisValues, supabaseValues] = await Promise.all([
      Promise.all(missing.map((u) => this.cache.get<string>(AuthCacheKey.lastActiveLegacy(u.id)))),
      this.readSupabaseLastActive(missing.map((u) => u.authId).filter((id): id is string => !!id)),
    ]);

    const em = this.orm.em.fork();
    let filled = 0;
    for (const [i, user] of missing.entries()) {
      const candidates = [Number(redisValues[i]), user.authId ? supabaseValues.get(user.authId) : undefined].filter(
        (t): t is number => typeof t === "number" && t > 0,
      );
      if (!candidates.length) continue;

      user.lastActiveAt = new Date(Math.max(...candidates));
      await em.nativeUpdate(UserEntity, { id: user.id, lastActiveAt: null }, { lastActiveAt: user.lastActiveAt });
      filled++;
    }
    this.logger.log(`Backfilled lastActiveAt for ${filled}/${missing.length} user(s)`);
  }

  /** authId → mốc hoạt động muộn nhất bên Supabase (ms). Lỗi đọc DB auth thì trả rỗng, chỉ dùng Redis */
  private async readSupabaseLastActive(authIds: string[]): Promise<Map<string, number>> {
    if (!authIds.length) return new Map();
    try {
      // refreshed_at là timestamp không múi giờ (UTC) → đổi sang timestamptz để so với các cột còn lại
      const rows = await this.authDb.query<{ id: string; last_active: Date | null }>(
        `select u.id, greatest(u.last_sign_in_at, max(s.updated_at), max(s.refreshed_at at time zone 'utc')) as last_active
         from auth.users u
         left join auth.sessions s on s.user_id = u.id
         where u.id = any($1::uuid[])
         group by u.id`,
        [authIds],
      );
      return new Map(rows.filter((r) => r.last_active).map((r) => [r.id, new Date(r.last_active).getTime()]));
    } catch (error) {
      this.logger.warn(`Failed to read last active from Supabase auth: ${(error as Error).message}`);
      return new Map();
    }
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
