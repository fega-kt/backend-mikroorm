import { ApprovalRequestEntity } from "@app-domain/entities/approval-request";
import { ApprovalEventType, type ApprovalEventMessage } from "@app-domain/services/approval-engine/approval-events";
import { SystemEmailTemplate } from "@app-domain/services/email-template/email-template.defaults";
import { renderTemplate, wrapEmailHtml } from "@app-domain/services/email-template/email-template.render";
import { resolveEmailTemplate } from "@app-domain/services/email-template/email-template.resolve";
import { buildRequestVariables } from "@app-domain/services/email-template/email-template.vars";
import { ENV } from "@config/env.config";
import { UserEntity } from "@core-service/entities/user";
import { MikroORM } from "@mikro-orm/core";
import { RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { ConsumerHandler, RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { ConsumeMessage } from "amqplib";
import { Resend } from "resend";

/** Sự kiện → mẫu email hệ thống; sự kiện không có ở đây thì không gửi email */
const TEMPLATE_BY_EVENT: Partial<Record<ApprovalEventType, SystemEmailTemplate>> = {
  [ApprovalEventType.StepPending]: SystemEmailTemplate.StepPending,
  [ApprovalEventType.Approved]: SystemEmailTemplate.Approved,
  [ApprovalEventType.Rejected]: SystemEmailTemplate.Rejected,
  [ApprovalEventType.Returned]: SystemEmailTemplate.Returned,
  [ApprovalEventType.Cancelled]: SystemEmailTemplate.Cancelled,
  [ApprovalEventType.Reminder]: SystemEmailTemplate.Reminder,
  [ApprovalEventType.Escalated]: SystemEmailTemplate.Escalated,
  [ApprovalEventType.Notify]: SystemEmailTemplate.Notify,
};

/** Gửi email theo mẫu (Mẫu email trong Quản trị) cho người nhận của event phê duyệt */
@Injectable()
export class ApprovalEmailConsumer implements OnModuleInit {
  private readonly logger = new Logger(ApprovalEmailConsumer.name);
  private readonly resend = ENV.RESEND_API_KEY ? new Resend(ENV.RESEND_API_KEY) : null;

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly orm: MikroORM,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.registerConsumer(RABBITMQ_QUEUES.APPROVAL_EMAIL, this.handle.bind(this) as ConsumerHandler);
  }

  private async handle(msg: ConsumeMessage, ack: () => void, nack: (requeue?: boolean) => void) {
    const event = JSON.parse(msg.content.toString()) as ApprovalEventMessage;
    const systemTemplate = TEMPLATE_BY_EVENT[event.type];
    if (!systemTemplate || !event.recipientIds?.length) return ack();
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not configured, skipping approval email");
      return ack();
    }

    const em = this.orm.em.fork();
    const code = event.type === ApprovalEventType.Notify && event.templateCode ? event.templateCode : systemTemplate;
    const template = await resolveEmailTemplate(em, code, systemTemplate);
    const request = await em.findOne(
      ApprovalRequestEntity,
      { id: event.requestId },
      { populate: ["requestType", "requester", "department"] },
    );
    const [users, actor] = await Promise.all([
      em.find(
        UserEntity,
        { id: { $in: event.recipientIds }, deleted: { $ne: true } },
        { fields: ["id", "fullName", "workEmail", "loginName"] },
      ),
      event.actorId ? em.findOne(UserEntity, { id: event.actorId }, { fields: ["id", "fullName"] }) : Promise.resolve(null),
    ]);

    const link = `${ENV.FRONTEND_URL.replace(/\/$/, "")}/approval/requests/${event.requestId}`;
    const vars = buildRequestVariables({
      code: request?.code ?? event.code,
      title: request?.title ?? event.title,
      typeName: request?.requestType?.name ?? event.requestTypeName,
      formSchema: request?.requestType?.formSchema,
      payload: request?.payload,
      requesterName: request?.requester?.fullName,
      departmentName: request?.department?.name,
      priority: request?.priority,
      link,
      stepName: event.nodeName,
      actorName: actor?.fullName,
      comment: event.comment,
      message: event.message,
    });

    try {
      for (const user of users) {
        const to = user.workEmail || user.loginName;
        if (!to?.includes("@")) continue;
        const personal = { ...vars, "recipient.name": user.fullName };
        const { error } = await this.resend.emails.send({
          from: ENV.MAIL_FROM,
          to,
          subject: renderTemplate(template.subject, personal, { html: false }),
          html: wrapEmailHtml(renderTemplate(template.body, personal, { html: true }), link),
        });
        if (error) throw new Error(error.message);
      }
      ack();
    } catch (err) {
      this.logger.error(`Approval email ${event.type} for ${event.requestId} failed: ${err instanceof Error ? err.message : String(err)}`);
      nack(false);
    }
  }
}
