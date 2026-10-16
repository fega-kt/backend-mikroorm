import { ENV } from "@config/env.config";
import { MikroORM } from "@mikro-orm/core";
import { ActivityLogQueueService } from "@core-service/services/activity-log-queue/activity-log-queue.service";
import { ActivityLogQueueStatus } from "@core-service/entities/activity-log-queue";
import { AppSettingEntity, AppSettingType } from "@core-service/entities/app-setting";
import { parseValueArray } from "@common/utils/parse-value.util";
import { CoreEmailTemplate, renderCoreEmail } from "@core-service/services/email-template/core-email.templates";
import { RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { ConsumerHandler, RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import type { InactiveReminderMessage } from "@modules/rabbitmq/types/message.types";
import { UserEntity } from "@core-service/entities/user";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { ConsumeMessage } from "amqplib";
import { Resend } from "resend";

@Injectable()
export class InactiveReminderConsumer implements OnModuleInit {
  private readonly logger = new Logger(InactiveReminderConsumer.name);
  private readonly resend = new Resend(ENV.RESEND_API_KEY);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly orm: MikroORM,
    private readonly activityLogQueueService: ActivityLogQueueService,
  ) {}

  async onModuleInit() {
    this.logger.log("Registering inactive reminder consumer...");
    await this.rabbitmq.registerConsumer(RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER, this.handle.bind(this) as ConsumerHandler);
  }

  private async handle(msg: ConsumeMessage, ack: () => void, nack: (requeue?: boolean) => void) {
    const payload = JSON.parse(msg.content.toString()) as InactiveReminderMessage;

    this.logger.log(`Received inactive reminder message for user ${payload.userId} with ${payload.days} days threshold`);

    const em = this.orm.em.fork();
    const allowListSetting = await em.findOne(AppSettingEntity, {
      key: AppSettingType.INACTIVE_EMAIL_ALLOWED_LIST,
      deleted: { $ne: true },
    });
    const allowedList: string[] = parseValueArray<string>(allowListSetting?.value).filter((v): v is string => typeof v === "string");

    const user = await em.findOne(
      UserEntity,
      { id: payload.userId, deleted: { $ne: true } },
      { fields: ["loginName", "workEmail", "fullName"] },
    );
    // Không gửi vì dữ liệu / cấu hình (không phải lỗi gửi): SKIPPED, giữ nguyên số lần thử đã có
    const skip = async (reason: string) => {
      this.logger.log(reason);
      if (payload.queueId) await this.activityLogQueueService.markSkipped(payload.queueId, reason);
      ack();
    };

    if (!user) return skip("User not found");
    const { fullName, loginName } = user;
    if (!allowedList.length) return skip("No allowed list configured, inactive reminder not sent");
    if (!allowedList.includes(loginName)) return skip(`Email ${loginName} not in allowed list, skipping inactive reminder`);

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
      const content = await renderCoreEmail(em, CoreEmailTemplate.InactiveReminder, {
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
      this.logger.error(`Failed to send inactive reminder to ${loginName} (attempt ${attempts}): ${error}`);
      if (payload.queueId) await this.activityLogQueueService.markFailed(payload.queueId, error, attempts);
      nack(false);
    }
  }
}
