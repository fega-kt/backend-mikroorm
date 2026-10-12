import { ApprovalEventType, type ApprovalEventMessage } from "@app-domain/services/approval-engine/approval-events";
import { ENV } from "@config/env.config";
import { UserEntity } from "@core-service/entities/user";
import { MikroORM } from "@mikro-orm/core";
import { RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { ConsumerHandler, RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { ConsumeMessage } from "amqplib";
import { Resend } from "resend";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

interface MailContent {
  subject: string;
  lead: string;
}

/** Nội dung email theo loại event; null → không gửi */
function buildContent(event: ApprovalEventMessage): MailContent | null {
  const ref = `${event.code ?? ""} – ${event.title}`.replace(/^ – /, "");
  const step = event.nodeName ? ` (bước “${event.nodeName}”)` : "";
  switch (event.type) {
    case ApprovalEventType.StepPending:
      return { subject: `[Phê duyệt] ${ref} đang chờ bạn duyệt`, lead: `Bạn có một tờ trình cần duyệt${step}.` };
    case ApprovalEventType.Approved:
      return { subject: `[Phê duyệt] ${ref} đã được duyệt`, lead: "Tờ trình của bạn đã được duyệt xong." };
    case ApprovalEventType.Rejected:
      return { subject: `[Phê duyệt] ${ref} bị từ chối`, lead: `Tờ trình của bạn bị từ chối${step}.` };
    case ApprovalEventType.Returned:
      return {
        subject: `[Phê duyệt] ${ref} được trả lại để bổ sung`,
        lead: `Tờ trình của bạn được trả lại${step}. Vui lòng bổ sung và gửi lại.`,
      };
    case ApprovalEventType.Cancelled:
      return { subject: `[Phê duyệt] ${ref} đã bị hủy`, lead: "Người tạo đã hủy tờ trình, bạn không cần duyệt nữa." };
    case ApprovalEventType.Reminder:
      return { subject: `[Nhắc duyệt] ${ref} đã quá hạn`, lead: `Tờ trình đang chờ bạn duyệt đã quá hạn xử lý${step}.` };
    case ApprovalEventType.Escalated:
      return { subject: `[Phê duyệt] ${ref} được chuyển cấp cho bạn`, lead: `Bước duyệt quá hạn nên được chuyển cho bạn${step}.` };
    case ApprovalEventType.Notify:
      return { subject: `[Thông báo] ${ref}`, lead: event.message || `Tờ trình đã đi qua bước thông báo${step}.` };
    default:
      return null;
  }
}

function renderHtml(event: ApprovalEventMessage, content: MailContent, fullName: string) {
  const link = `${ENV.FRONTEND_URL.replace(/\/$/, "")}/approval/requests/${event.requestId}`;
  const comment = event.comment
    ? `<p style="margin:12px 0;padding:8px 12px;background:#f5f5f5;border-left:3px solid #999">${escapeHtml(event.comment)}</p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
  <p>Xin chào ${escapeHtml(fullName)},</p>
  <p>${escapeHtml(content.lead)}</p>
  <p><b>${escapeHtml(event.code ?? "")}</b> ${escapeHtml(event.title)}${event.requestTypeName ? ` · ${escapeHtml(event.requestTypeName)}` : ""}</p>
  ${comment}
  <p><a href="${link}" style="display:inline-block;padding:8px 16px;background:#2457D6;color:#fff;text-decoration:none;border-radius:6px">Xem tờ trình</a></p>
</div>`;
}

/** Gửi email cho người nhận của event phê duyệt (thông báo trong ứng dụng đã ghi ở app) */
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
    const content = buildContent(event);
    if (!content || !event.recipientIds?.length) return ack();
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not configured, skipping approval email");
      return ack();
    }

    const users = await this.orm.em
      .fork()
      .find(
        UserEntity,
        { id: { $in: event.recipientIds }, deleted: { $ne: true } },
        { fields: ["id", "fullName", "workEmail", "loginName"] },
      );

    try {
      for (const user of users) {
        const to = user.workEmail || user.loginName;
        if (!to?.includes("@")) continue;
        const { error } = await this.resend.emails.send({
          from: ENV.MAIL_FROM,
          to,
          subject: content.subject,
          html: renderHtml(event, content, user.fullName),
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
