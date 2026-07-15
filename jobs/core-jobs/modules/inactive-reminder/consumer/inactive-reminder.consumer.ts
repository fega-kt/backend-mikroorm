import { ENV } from "@config/env.config";
import { MikroORM } from "@mikro-orm/core";
import { ActivityLogQueueService } from "@core-service/services/activity-log-queue/activity-log-queue.service";
import { AppSettingEntity, AppSettingType } from "@core-service/entities/app-setting";
import { parseSettingArray, parseSettingString } from "@core-service/services/app-setting/app-setting.util";
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
    const [templateSetting, allowListSetting] = await Promise.all([
      em.findOne(AppSettingEntity, { key: AppSettingType.MAIL_TEMPLATE_INACTIVE_REMINDER, deleted: { $ne: true } }),
      em.findOne(AppSettingEntity, { key: AppSettingType.INACTIVE_EMAIL_ALLOWED_LIST, deleted: { $ne: true } }),
    ]);

    const templateId: string = parseSettingString(templateSetting?.value);
    if (!templateId) {
      this.logger.warn("MAIL_TEMPLATE_INACTIVE_REMINDER not configured, skipping");
      ack();
      return;
    }

    const allowedList: string[] = parseSettingArray<string>(allowListSetting?.value).filter((v): v is string => typeof v === "string");

    const user = await em.findOne(
      UserEntity,
      { id: payload.userId, deleted: { $ne: true } },
      { fields: ["loginName", "workEmail", "fullName"] },
    );
    if (!user) {
      if (payload.queueId) await this.activityLogQueueService.markFailed(payload.queueId, "User not found", 0);
      ack();
      return;
    }

    const { fullName, loginName } = user;
    if (!allowedList.length) {
      const message = "No allowed list configured, sending inactive reminder to all users";
      this.logger.warn(message);
      if (payload.queueId) await this.activityLogQueueService.markFailed(payload.queueId, message, 0);
      ack();
      return;
    }

    if (allowedList.length > 0 && !allowedList.includes(loginName)) {
      const message = `Email ${loginName} not in allowed list, skipping inactive reminder`;
      this.logger.log(message);

      if (payload.queueId) await this.activityLogQueueService.markFailed(payload.queueId, message, 0);

      ack();
      return;
    }

    if (payload.queueId) await this.activityLogQueueService.markInProgress(payload.queueId);

    try {
      const { error } = await this.resend.emails.send({
        from: ENV.MAIL_FROM,
        to: loginName,
        template: { id: templateId, variables: { USER_NAME: fullName, DAYS: String(payload.days) } },
      });
      if (error) throw new Error(error.message);
      if (payload.queueId) await this.activityLogQueueService.markCompleted(payload.queueId);
      ack();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send inactive reminder to ${loginName}: ${error}`);
      if (payload.queueId) await this.activityLogQueueService.markFailed(payload.queueId, error, 1);
      nack(false);
    }
  }
}
