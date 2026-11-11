import { ENV } from "@config/env.config";
import { MikroORM } from "@mikro-orm/core";
import { ActivityLogQueueService } from "@core-service/services/activity-log-queue/activity-log-queue.service";
import { ActivityLogQueueStatus } from "@core-service/entities/activity-log-queue";
import { CoreEmailTemplate, renderCoreEmail } from "@core-service/services/email-template/core-email.templates";
import { RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { ConsumerHandler, RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import type { AccountLockedMessage } from "@modules/rabbitmq/types/message.types";
import { UserEntity } from "@core-service/entities/user";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { ConsumeMessage } from "amqplib";
import { Resend } from "resend";

/**
 * Gửi email báo tài khoản đã bị khóa vì lâu không đăng nhập. Không qua allow-list của mail nhắc: bật INACTIVE_LOCK_DAYS
 * đã là bước bật tính năng, và người bị khóa phải biết lý do.
 */
@Injectable()
export class AccountLockedConsumer implements OnModuleInit {
  private readonly logger = new Logger(AccountLockedConsumer.name);
  private readonly resend = new Resend(ENV.RESEND_API_KEY);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly orm: MikroORM,
    private readonly activityLogQueueService: ActivityLogQueueService,
  ) {}

  async onModuleInit() {
    this.logger.log("Registering account locked consumer...");
    await this.rabbitmq.registerConsumer(RABBITMQ_QUEUES.NOTIFICATION_EMAIL_ACCOUNT_LOCKED, this.handle.bind(this) as ConsumerHandler);
  }

  private async handle(msg: ConsumeMessage, ack: () => void, nack: (requeue?: boolean) => void) {
    const payload = JSON.parse(msg.content.toString()) as AccountLockedMessage;
    this.logger.log(`Received account locked message for user ${payload.userId} (${payload.days} days inactive)`);

    const em = this.orm.em.fork();
    const user = await em.findOne(UserEntity, { id: payload.userId, deleted: { $ne: true } }, { fields: ["loginName", "fullName"] });
    // Không gửi vì dữ liệu / cấu hình (không phải lỗi gửi): SKIPPED, giữ nguyên số lần thử đã có
    const skip = async (reason: string) => {
      this.logger.log(reason);
      if (payload.queueId) await this.activityLogQueueService.markSkipped(payload.queueId, reason);
      ack();
    };

    if (!user) return skip("User not found");
    const { fullName, loginName } = user;

    // Mỗi lần gửi là một lần thử, cộng dồn qua các lần "Gửi lại"; ghi ngay trước khi gửi để job dừng giữa chừng vẫn đếm đúng
    const previous = payload.queueId ? ((await this.activityLogQueueService.findOne(payload.queueId))?.attempts ?? 0) : 0;
    const attempts = previous + 1;
    if (payload.queueId) {
      await this.activityLogQueueService.update(payload.queueId, {
        status: ActivityLogQueueStatus.IN_PROGRESS,
        attempts,
        recipient: loginName,
        lastAttemptAt: new Date(),
      });
    }

    try {
      const content = await renderCoreEmail(em, CoreEmailTemplate.AccountLocked, {
        "user.name": fullName,
        "user.email": loginName,
        "inactive.days": String(payload.days),
      });
      const { error } = await this.resend.emails.send({ from: ENV.MAIL_FROM, to: loginName, ...content });
      if (error) throw new Error(error.message);
      if (payload.queueId) await this.activityLogQueueService.markCompleted(payload.queueId, { attempts });
      ack();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send account locked email to ${loginName} (attempt ${attempts}): ${error}`);
      if (payload.queueId) await this.activityLogQueueService.markFailed(payload.queueId, error, attempts);
      nack(false);
    }
  }
}
