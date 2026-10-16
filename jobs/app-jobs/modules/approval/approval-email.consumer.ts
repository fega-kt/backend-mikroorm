import { ApprovalRequestEntity } from "@app-domain/entities/approval-request";
import { ApprovalEventType, type ApprovalEventMessage } from "@app-domain/services/approval-engine/approval-events";
import { SystemEmailTemplate } from "@app-domain/services/email-template/email-template.defaults";
import { resolveEmailTemplate } from "@app-domain/services/email-template/email-template.resolve";
import { buildRequestVariables } from "@app-domain/services/email-template/email-template.vars";
import { FrontendPath, frontendUrl } from "@common/constants/frontend-path.constant";
import { ENV } from "@config/env.config";
import { type EmailTemplateBody, renderEmail } from "@core-service/services/email-template/email-template.render";
import { parseValueBoolean } from "@common/utils/parse-value.util";
import { ActivityLogQueueStatus } from "@core-service/entities/activity-log-queue";
import { AppSettingEntity, AppSettingType } from "@core-service/entities/app-setting";
import { NotificationType } from "@core-service/entities/notification";
import { UserEntity } from "@core-service/entities/user";
import { ActivityLogQueueService } from "@core-service/services/activity-log-queue/activity-log-queue.service";
import { MikroORM } from "@mikro-orm/core";
import { RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { ConsumerHandler, RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { ConsumeMessage } from "amqplib";
import { Resend } from "resend";

/** Sự kiện → mẫu email hệ thống + loại ghi ở hàng đợi gửi mail; sự kiện không có ở đây thì không gửi email */
const EVENT_MAP: Partial<Record<ApprovalEventType, { template: SystemEmailTemplate; type: NotificationType }>> = {
  [ApprovalEventType.StepPending]: { template: SystemEmailTemplate.StepPending, type: NotificationType.APPROVAL_PENDING },
  [ApprovalEventType.Approved]: { template: SystemEmailTemplate.Approved, type: NotificationType.APPROVAL_APPROVED },
  [ApprovalEventType.Rejected]: { template: SystemEmailTemplate.Rejected, type: NotificationType.APPROVAL_REJECTED },
  [ApprovalEventType.Returned]: { template: SystemEmailTemplate.Returned, type: NotificationType.APPROVAL_RETURNED },
  [ApprovalEventType.Cancelled]: { template: SystemEmailTemplate.Cancelled, type: NotificationType.APPROVAL_CANCELLED },
  [ApprovalEventType.Reminder]: { template: SystemEmailTemplate.Reminder, type: NotificationType.APPROVAL_REMINDER },
  [ApprovalEventType.Escalated]: { template: SystemEmailTemplate.Escalated, type: NotificationType.APPROVAL_ESCALATED },
  [ApprovalEventType.Notify]: { template: SystemEmailTemplate.Notify, type: NotificationType.APPROVAL_NOTIFY },
  [ApprovalEventType.StepApproved]: { template: SystemEmailTemplate.StepApproved, type: NotificationType.APPROVAL_STEP_APPROVED },
  [ApprovalEventType.Shared]: { template: SystemEmailTemplate.Shared, type: NotificationType.APPROVAL_SHARED },
};

const REF_TYPE = "approval_requests";
/** Số lần gửi mỗi lượt (lỗi tạm thời thì thử lại sau 2s, 10s) */
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2_000, 10_000];

/** Message từ engine (nhiều người nhận) hoặc từ "Gửi lại" ở hàng đợi gửi mail (có queueId, một người nhận) */
type EmailMessage = ApprovalEventMessage & { queueId?: string; userId?: string };

type Recipient = Pick<UserEntity, "id" | "fullName" | "workEmail" | "loginName">;

interface EmailContext {
  template: EmailTemplateBody;
  vars: Record<string, string>;
  users: Map<string, Recipient>;
  /** Setting WORK_EMAIL_FALLBACK_TO_LOGIN_NAME: người chưa có email công việc thì gửi qua email đăng nhập */
  fallbackToLoginName: boolean;
}

const asEmail = (value?: string | null) => {
  const email = value?.trim();
  return email?.includes("@") ? email : undefined;
};

/** Địa chỉ nhận mail công việc: email công việc; chỉ khi bật setting mới dùng email đăng nhập cho người chưa có */
export function recipientAddress(user: Pick<Recipient, "workEmail" | "loginName">, fallbackToLoginName: boolean) {
  return asEmail(user.workEmail) ?? (fallbackToLoginName ? asEmail(user.loginName) : undefined);
}

class SendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Gửi email theo mẫu (Mẫu email trong Quản trị) cho người nhận của event phê duyệt.
 * Mỗi người nhận là một dòng ở hàng đợi gửi mail (activity_log_queue): trạng thái, số lần thử, lỗi — gửi lại được từ màn quản trị.
 */
@Injectable()
export class ApprovalEmailConsumer implements OnModuleInit {
  private readonly logger = new Logger(ApprovalEmailConsumer.name);
  private readonly resend = ENV.RESEND_API_KEY ? new Resend(ENV.RESEND_API_KEY) : null;
  /** Giãn cách giữa các lần thử (test đặt về 0) */
  protected retryDelaysMs = RETRY_DELAYS_MS;

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly orm: MikroORM,
    private readonly queue: ActivityLogQueueService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.registerConsumer(RABBITMQ_QUEUES.APPROVAL_EMAIL, this.handle.bind(this) as ConsumerHandler);
  }

  private async handle(msg: ConsumeMessage, ack: () => void, nack: (requeue?: boolean) => void) {
    let event: EmailMessage;
    try {
      event = JSON.parse(msg.content.toString()) as EmailMessage;
    } catch {
      this.logger.error("Invalid approval email message");
      return nack(false);
    }
    const mapping = EVENT_MAP[event.type];
    if (!mapping) return ack();

    try {
      if (event.queueId) {
        const userId = event.userId ?? event.recipientIds?.[0];
        const context = await this.buildContext(event, mapping.template, [userId]);
        await this.deliver(context, userId, event.queueId);
        return ack();
      }
      if (!event.recipientIds?.length) return ack();

      // Outbox đảm bảo "ít nhất một lần" → event có thể tới lại; người nhận đã có dòng cho event này thì bỏ qua
      const handled = new Set(event.eventId ? (await this.queue.findByEvent(event.eventId)).map((row) => row.userId) : []);
      const recipients = event.recipientIds.filter((userId) => !handled.has(userId));
      if (!recipients.length) return ack();

      const context = await this.buildContext(event, mapping.template, recipients);
      const items = [];
      for (const userId of recipients) {
        items.push(
          await this.queue.create({
            userId,
            type: mapping.type,
            payload: { ...event, recipientIds: [userId] },
            refType: REF_TYPE,
            refId: event.requestId,
            eventId: event.eventId,
          }),
        );
      }
      for (const item of items) await this.deliver(context, item.userId, item.id);
      ack();
    } catch (err) {
      // Lỗi hệ thống (DB…) trước khi ghi được trạng thái từng người → đưa vào DLQ
      this.logger.error(`Approval email ${event.type} for ${event.requestId} failed: ${errorMessage(err)}`);
      nack(false);
    }
  }

  private async buildContext(event: EmailMessage, systemTemplate: SystemEmailTemplate, userIds: string[]): Promise<EmailContext> {
    const em = this.orm.em.fork();
    // Mẫu chọn trong cấu hình quy trình (bước Thông báo / thông báo của bước duyệt), không có thì mẫu hệ thống
    const template = await resolveEmailTemplate(em, event.templateCode || systemTemplate, systemTemplate);
    const request = await em.findOne(
      ApprovalRequestEntity,
      { id: event.requestId },
      { populate: ["requestTypeVersion", "formVersion", "requester", "department"] },
    );
    const [users, actor, fallbackSetting] = await Promise.all([
      em.find(UserEntity, { id: { $in: userIds }, deleted: { $ne: true } }, { fields: ["id", "fullName", "workEmail", "loginName"] }),
      event.actorId ? em.findOne(UserEntity, { id: event.actorId }, { fields: ["id", "fullName"] }) : Promise.resolve(null),
      em.findOne(
        AppSettingEntity,
        { key: AppSettingType.WORK_EMAIL_FALLBACK_TO_LOGIN_NAME, deleted: { $ne: true } },
        { fields: ["value"] },
      ),
    ]);

    const link = frontendUrl(FrontendPath.ApprovalRequests, event.requestId);
    const vars = buildRequestVariables({
      code: request?.code ?? event.code,
      title: request?.title ?? event.title,
      typeName: request?.requestTypeVersion?.name ?? event.requestTypeName,
      formSchema: request?.formVersion?.formSchema,
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
    return {
      template,
      vars,
      users: new Map(users.map((user) => [user.id, user])),
      fallbackToLoginName: parseValueBoolean(fallbackSetting?.value),
    };
  }

  /** Gửi cho một người nhận và ghi kết quả vào dòng hàng đợi `queueId` */
  private async deliver(context: EmailContext, userId: string, queueId: string) {
    const user = context.users.get(userId);
    if (!user) return this.queue.markSkipped(queueId, "User not found");
    // Mail công việc gửi tới email công việc; chỉ khi bật setting mới dùng email đăng nhập cho người chưa có
    const to = recipientAddress(user, context.fallbackToLoginName);
    if (!to)
      return this.queue.markSkipped(
        queueId,
        context.fallbackToLoginName ? "Recipient has no email address" : "Recipient has no work email",
      );

    const personal = { ...context.vars, "recipient.name": user.fullName };
    const { subject, html } = renderEmail(context.template, personal);
    if (!this.resend) return this.queue.markSkipped(queueId, "RESEND_API_KEY not configured", { recipient: to, subject });

    const previous = (await this.queue.findOne(queueId))?.attempts ?? 0;
    await this.queue.update(queueId, { status: ActivityLogQueueStatus.IN_PROGRESS, recipient: to, subject, lastAttemptAt: new Date() });

    let attempts = previous;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      attempts++;
      try {
        await this.send(to, subject, html);
        return this.queue.markCompleted(queueId, { attempts });
      } catch (err) {
        const retryable = !(err instanceof SendError) || err.retryable;
        if (!retryable || i === MAX_ATTEMPTS - 1) {
          this.logger.warn(`Approval email to ${to} failed after ${attempts} attempt(s): ${errorMessage(err)}`);
          return this.queue.markFailed(queueId, errorMessage(err), attempts);
        }
        await sleep(this.retryDelaysMs[i] ?? this.retryDelaysMs[this.retryDelaysMs.length - 1] ?? 0);
      }
    }
  }

  private async send(to: string, subject: string, html: string) {
    const { error } = await this.resend.emails.send({ from: ENV.MAIL_FROM, to, subject, html });
    if (!error) return;
    // Lỗi dữ liệu (địa chỉ sai, thiếu quyền domain…) thử lại cũng vậy; còn lại (quá tải, mạng, 5xx) thì thử lại
    const permanent = /validation|invalid|missing|restricted|not_found|forbidden/i.test(error.name ?? "");
    throw new SendError(error.message, !permanent);
  }
}
