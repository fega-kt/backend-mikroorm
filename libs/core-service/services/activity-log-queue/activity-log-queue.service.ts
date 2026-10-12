import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { FilterQuery, MikroORM } from "@mikro-orm/core";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { Injectable, NotFoundException } from "@nestjs/common";
import { ActivityLogQueueEntity, ActivityLogQueueStatus } from "../../entities/activity-log-queue";
import { NotificationType } from "../../entities/notification";
import { UserEntity } from "../../entities/user";

/** Email phê duyệt gửi lại qua queue approval.email (consumer nhận message có queueId → gửi đúng một người) */
const APPROVAL_EMAIL_TYPES = [
  NotificationType.APPROVAL_PENDING,
  NotificationType.APPROVAL_APPROVED,
  NotificationType.APPROVAL_REJECTED,
  NotificationType.APPROVAL_RETURNED,
  NotificationType.APPROVAL_CANCELLED,
  NotificationType.APPROVAL_REMINDER,
  NotificationType.APPROVAL_ESCALATED,
  NotificationType.APPROVAL_NOTIFY,
  NotificationType.APPROVAL_STEP_APPROVED,
];

const QUEUE_BY_TYPE: Partial<Record<NotificationType, string>> = {
  [NotificationType.LOGIN_INACTIVE_REMINDER]: RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER,
  ...Object.fromEntries(APPROVAL_EMAIL_TYPES.map((type) => [type, RABBITMQ_QUEUES.APPROVAL_EMAIL])),
};

/** Lỗi lưu tối đa (tránh dồn cả stack trace dài vào bảng) */
const MAX_ERROR_LENGTH = 2000;

export interface ActivityLogQueueFilter {
  page: number;
  limit: number;
  status?: ActivityLogQueueStatus;
  type?: NotificationType;
  refId?: string;
  keyword?: string;
}

type QueuePatch = Partial<Pick<ActivityLogQueueEntity, "status" | "attempts" | "error" | "recipient" | "subject" | "lastAttemptAt">>;

@Injectable()
export class ActivityLogQueueService {
  constructor(
    private readonly orm: MikroORM,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  async create(data: {
    userId: string;
    type: NotificationType;
    payload: object;
    refType?: string;
    refId?: string;
    recipient?: string;
    eventId?: string;
  }) {
    const em = this.orm.em.fork();
    const item = em.create(ActivityLogQueueEntity, {
      userId: data.userId,
      type: data.type,
      data: JSON.stringify(data.payload),
      refType: data.refType,
      refId: data.refId,
      recipient: data.recipient,
      eventId: data.eventId,
      status: ActivityLogQueueStatus.DRAFT,
      attempts: 0,
      createdBy: em.getReference(UserEntity, SYSTEM_USER_ID),
      updatedBy: em.getReference(UserEntity, SYSTEM_USER_ID),
    });
    await em.persistAndFlush(item);
    return item;
  }

  /** Các dòng đã tạo cho một event (để bỏ qua event nhận trùng) */
  async findByEvent(eventId: string) {
    return this.orm.em.fork().find(ActivityLogQueueEntity, { eventId }, { fields: ["id", "userId", "status"] });
  }

  async findOne(id: string) {
    return this.orm.em.fork().findOne(ActivityLogQueueEntity, { id, deleted: { $ne: true } });
  }

  async update(id: string, patch: QueuePatch) {
    const em = this.orm.em.fork();
    const error = patch.error === undefined ? undefined : (patch.error?.slice(0, MAX_ERROR_LENGTH) ?? null);
    await em.nativeUpdate(ActivityLogQueueEntity, { id }, { ...patch, ...(error === undefined ? {} : { error }) });
  }

  async markInProgress(id: string) {
    await this.update(id, { status: ActivityLogQueueStatus.IN_PROGRESS, lastAttemptAt: new Date() });
  }

  async markCompleted(id: string, patch: QueuePatch = {}) {
    await this.update(id, { ...patch, status: ActivityLogQueueStatus.COMPLETED, error: null, lastAttemptAt: new Date() });
  }

  async markFailed(id: string, error: string, attempts: number) {
    await this.update(id, { status: ActivityLogQueueStatus.FAILED, error, attempts, lastAttemptAt: new Date() });
  }

  async markSkipped(id: string, reason: string, patch: QueuePatch = {}) {
    await this.update(id, { ...patch, status: ActivityLogQueueStatus.SKIPPED, error: reason, lastAttemptAt: new Date() });
  }

  async findAll(filter: ActivityLogQueueFilter) {
    const { page, limit } = filter;
    const em = this.orm.em.fork();
    const where: FilterQuery<ActivityLogQueueEntity> = { deleted: { $ne: true } };
    if (filter.status) where.status = filter.status;
    if (filter.type) where.type = filter.type;
    if (filter.refId) where.refId = filter.refId;
    if (filter.keyword) {
      const like = `%${filter.keyword.replace(/[%_\\]/g, "\\$&")}%`;
      where.$or = [{ recipient: { $ilike: like } }, { subject: { $ilike: like } }];
    }
    const [items, total] = await em.findAndCount(ActivityLogQueueEntity, where, {
      orderBy: { createdAt: "DESC" },
      limit,
      offset: (page - 1) * limit,
    });

    // userId là cột chuỗi (không phải quan hệ) → tra tên người nhận một lần cho cả trang
    const userIds = [...new Set(items.map((item) => item.userId))];
    const users = userIds.length ? await em.find(UserEntity, { id: { $in: userIds } }, { fields: ["id", "fullName", "loginName"] }) : [];
    const userMap = new Map(users.map((user) => [user.id, { id: user.id, fullName: user.fullName, loginName: user.loginName }]));

    return {
      items: items.map((item) => ({
        id: item.id,
        userId: item.userId,
        user: userMap.get(item.userId) ?? null,
        type: item.type,
        status: item.status,
        refType: item.refType ?? null,
        refId: item.refId ?? null,
        recipient: item.recipient ?? null,
        subject: item.subject ?? null,
        attempts: item.attempts,
        error: item.error ?? null,
        lastAttemptAt: item.lastAttemptAt ?? null,
        createdAt: item.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  async retry(id: string) {
    const em = this.orm.em.fork();
    const item = await em.findOne(ActivityLogQueueEntity, { id, deleted: { $ne: true } });
    if (!item) throw new NotFoundException("Activity log queue item not found");

    const msg = { ...(JSON.parse(item.data) as object), queueId: item.id, userId: item.userId };
    const queue = QUEUE_BY_TYPE[item.type];
    if (!queue) throw new Error(`No queue configured for notification type: ${item.type}`);
    if (!this.rabbitmq.isConnected) throw new Error("RabbitMQ is not connected");
    await this.rabbitmq.publish(RABBITMQ_EXCHANGE.NOTIFICATION, queue, msg);
    await em.nativeUpdate(ActivityLogQueueEntity, { id }, { status: ActivityLogQueueStatus.DRAFT, error: null });
  }
}
