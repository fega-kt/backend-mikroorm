import { SYSTEM_USER } from "@common/base/consts";
import { parseValuePositiveInt } from "@common/utils/parse-value.util";
import { FilterQuery, MikroORM, RequestContext } from "@mikro-orm/core";
import { AppSettingEntity, AppSettingType } from "@core-service/entities/app-setting";
import { NotificationType } from "@core-service/entities/notification";
import { UserEntity } from "@core-service/entities/user";
import { ActivityLogQueueService } from "@core-service/services/activity-log-queue/activity-log-queue.service";
import { UserService } from "@core-service/services/user/user.service";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { Injectable, Logger } from "@nestjs/common";
import { ContextIdFactory, ModuleRef } from "@nestjs/core";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Request } from "express";
import { LastActiveBackfillService } from "./last-active-backfill.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;
/** Giữ thấp để không dính rate limit API admin của Supabase */
const CONCURRENCY = 5;

/** Request giả cho các service request-scoped: chúng đọc người thao tác từ request.user, activity log đọc thêm ip / headers */
const SYSTEM_REQUEST = { user: SYSTEM_USER, ip: "system", headers: {} } as unknown as Request;

type LockResult = "locked" | "skipped" | "failed";

async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item);
  });
  await Promise.all(runners);
}

/**
 * Tự khóa tài khoản lâu không hoạt động (INACTIVE_LOCK_DAYS) rồi gửi mail báo. User lỗi hôm nay vẫn còn isActive=true
 * nên tự có mặt trong lần quét sau.
 */
@Injectable()
export class InactiveUserLockService {
  private readonly logger = new Logger(InactiveUserLockService.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly moduleRef: ModuleRef,
    private readonly rabbitmq: RabbitMQService,
    private readonly activityLogQueueService: ActivityLogQueueService,
    private readonly lastActiveBackfill: LastActiveBackfillService,
  ) {}

  /** Chạy trước cron nhắc (9h) để người vừa bị khóa không nhận thêm mail "còn N ngày" */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async lockInactiveUsers() {
    const em = this.orm.em.fork();
    const lockSetting = await em.findOne(AppSettingEntity, { key: AppSettingType.INACTIVE_LOCK_DAYS, deleted: { $ne: true } });
    const lockDays = parseValuePositiveInt(lockSetting?.value);
    if (!lockDays) {
      this.logger.log("Inactive account lock is disabled (INACTIVE_LOCK_DAYS not set), skipping");
      return;
    }

    const thresholdSetting = await em.findOne(AppSettingEntity, { key: AppSettingType.INACTIVE_DAYS_THRESHOLD, deleted: { $ne: true } });
    const thresholdDays = parseValuePositiveInt(thresholdSetting?.value) ?? 7;
    if (lockDays <= thresholdDays) {
      this.logger.warn(`INACTIVE_LOCK_DAYS (${lockDays}) must be greater than INACTIVE_DAYS_THRESHOLD (${thresholdDays}), skipping`);
      return;
    }

    const cutoff = new Date(Date.now() - lockDays * DAY_MS);
    this.logger.log(`Running inactive account lock job (lock after ${lockDays} days, cutoff ${cutoff.toISOString()})...`);

    const counts: Record<LockResult, number> = { locked: 0, skipped: 0, failed: 0 };
    const lockedIds: string[] = [];
    let lastId: string | undefined;

    for (;;) {
      // User chưa có lastActiveAt tính tạm từ createdAt, mốc thật được backfill ngay sau đó
      const where: FilterQuery<UserEntity> = {
        deleted: { $ne: true },
        isActive: true,
        authId: { $ne: null },
        $or: [{ lastActiveAt: { $lt: cutoff } }, { lastActiveAt: null, createdAt: { $lt: cutoff } }],
        ...(lastId ? { id: { $gt: lastId } } : {}),
      };
      const batch = await em.find(UserEntity, where, {
        fields: ["id", "authId", "createdAt", "lastActiveAt"],
        orderBy: { id: "asc" },
        limit: BATCH_SIZE,
        disableIdentityMap: true,
      });
      if (!batch.length) break;
      lastId = batch[batch.length - 1].id;

      await this.lastActiveBackfill.backfill(batch);
      const due = batch.filter((user) => (user.lastActiveAt ?? user.createdAt) < cutoff);
      counts.skipped += batch.length - due.length;

      await runPool(due, CONCURRENCY, async (user) => {
        const result = await this.lockOne(user, cutoff);
        counts[result]++;
        if (result === "locked") lockedIds.push(user.id);
      });
    }

    this.logger.log(`Inactive account lock done: locked ${counts.locked}, skipped ${counts.skipped}, failed ${counts.failed}`);
    if (lockedIds.length) this.logger.log(`Locked user ids: ${lockedIds.join(", ")}`);
  }

  private async lockOne(user: Pick<UserEntity, "id" | "createdAt" | "lastActiveAt">, cutoff: Date): Promise<LockResult> {
    const days = Math.floor((Date.now() - (user.lastActiveAt ?? user.createdAt).getTime()) / DAY_MS);

    try {
      // Mỗi user một context riêng để EntityManager và service request-scoped đều mới
      let locked = false;
      await RequestContext.create(this.orm.em, async () => {
        const contextId = ContextIdFactory.create();
        this.moduleRef.registerRequestByContextId(SYSTEM_REQUEST, contextId);
        const userService = await this.moduleRef.resolve(UserService, contextId, { strict: false });
        locked = (await userService.updateActive(user.id, false, { reason: "inactivity", ifInactiveSince: cutoff })) !== null;
      });
      if (!locked) return "skipped";
    } catch (error) {
      this.logger.warn(`Failed to lock user ${user.id}, will retry next run: ${(error as Error).message}`);
      return "failed";
    }

    // Lỗi đẩy mail không làm việc khóa thành thất bại
    await this.queueLockedEmail(user.id, days).catch((error: Error) =>
      this.logger.error(`Failed to queue account locked email for user ${user.id}: ${error.message}`),
    );
    return "locked";
  }

  private async queueLockedEmail(userId: string, days: number) {
    const queueItem = await this.activityLogQueueService.create({ userId, type: NotificationType.ACCOUNT_LOCKED, payload: { days } });
    if (!this.rabbitmq.isConnected) {
      this.logger.warn(`RabbitMQ not connected, account locked email for user ${userId} left as draft (resend from queue list)`);
      return;
    }
    await this.rabbitmq.publish(RABBITMQ_EXCHANGE.NOTIFICATION, RABBITMQ_QUEUES.NOTIFICATION_EMAIL_ACCOUNT_LOCKED, {
      days,
      queueId: queueItem.id,
      userId,
    });
  }
}
