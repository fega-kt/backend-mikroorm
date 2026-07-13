import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { FilterQuery, MikroORM } from "@mikro-orm/core";
import { NotificationType } from "@modules/notification/entity/notification.entity";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { UserEntity } from "@modules/user/entity/user.entity";
import { Injectable, NotFoundException } from "@nestjs/common";
import { ActivityLogQueueEntity, ActivityLogQueueStatus } from "../entity/activity-log-queue.entity";

const QUEUE_BY_TYPE: Partial<Record<NotificationType, string>> = {
  [NotificationType.LOGIN_INACTIVE_REMINDER]: RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER,
};

@Injectable()
export class ActivityLogQueueService {
  constructor(
    private readonly orm: MikroORM,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  async create(data: { userId: string; type: NotificationType; payload: object }) {
    const em = this.orm.em.fork();
    const item = em.create(ActivityLogQueueEntity, {
      userId: data.userId,
      type: data.type,
      data: JSON.stringify(data.payload),
      status: ActivityLogQueueStatus.DRAFT,
      attempts: 0,
      createdBy: em.getReference(UserEntity, SYSTEM_USER_ID),
      updatedBy: em.getReference(UserEntity, SYSTEM_USER_ID),
    });
    await em.persistAndFlush(item);
    return item;
  }

  async markInProgress(id: string) {
    const em = this.orm.em.fork();
    await em.nativeUpdate(ActivityLogQueueEntity, { id }, { status: ActivityLogQueueStatus.IN_PROGRESS, lastAttemptAt: new Date() });
  }

  async markCompleted(id: string) {
    const em = this.orm.em.fork();
    await em.nativeUpdate(ActivityLogQueueEntity, { id }, { status: ActivityLogQueueStatus.COMPLETED, lastAttemptAt: new Date() });
  }

  async markFailed(id: string, error: string, attempts: number) {
    const em = this.orm.em.fork();
    await em.nativeUpdate(
      ActivityLogQueueEntity,
      { id },
      { status: ActivityLogQueueStatus.FAILED, error, attempts, lastAttemptAt: new Date() },
    );
  }

  async findAll(page: number, limit: number, status?: ActivityLogQueueStatus) {
    const em = this.orm.em.fork();
    const where: FilterQuery<ActivityLogQueueEntity> = { deleted: { $ne: true } };
    if (status) where.status = status;
    const [items, total] = await em.findAndCount(ActivityLogQueueEntity, where, {
      orderBy: { createdAt: "DESC" },
      limit,
      offset: (page - 1) * limit,
    });
    return { items, total, page, limit };
  }

  async retry(id: string) {
    const em = this.orm.em.fork();
    const item = await em.findOne(ActivityLogQueueEntity, { id, deleted: { $ne: true } });
    if (!item) throw new NotFoundException("Activity log queue item not found");

    const msg = { ...(JSON.parse(item.data) as object), queueId: item.id };
    const queue = QUEUE_BY_TYPE[item.type];
    if (!queue) throw new Error(`No queue configured for notification type: ${item.type}`);
    await this.rabbitmq.publish(RABBITMQ_EXCHANGE.NOTIFICATION, queue, msg);
    await em.nativeUpdate(ActivityLogQueueEntity, { id }, { status: ActivityLogQueueStatus.DRAFT });
  }
}
