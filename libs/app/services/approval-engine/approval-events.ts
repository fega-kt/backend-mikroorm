import { RABBITMQ_EXCHANGE } from "@modules/rabbitmq/rabbitmq.constants";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { Injectable, Logger, Optional } from "@nestjs/common";

/** Event phát ra sau khi transaction commit; routing key = approval.<type> */
export enum ApprovalEventType {
  Submitted = "request.submitted",
  StepPending = "request.step_pending",
  Approved = "request.approved",
  Rejected = "request.rejected",
  Returned = "request.returned",
  Cancelled = "request.cancelled",
  Reminder = "request.reminder",
  Escalated = "request.escalated",
  Notify = "request.notify",
}

export interface ApprovalEventMessage {
  type: ApprovalEventType;
  requestId: string;
  code?: string;
  title: string;
  requestTypeName?: string;
  requesterId: string;
  /** Người nhận email (đã loại người thao tác) */
  recipientIds: string[];
  actorId?: string;
  nodeName?: string;
  comment?: string;
  /** Nội dung tùy chỉnh của node notify */
  message?: string;
  /** Mẫu email của node notify (bỏ trống → mẫu mặc định) */
  templateCode?: string;
  occurredAt: string;
}

/**
 * Đẩy event lên RabbitMQ. Nghiệp vụ khác (trừ ngày phép...) chỉ cần thêm consumer cho approval.request.approved.
 * RabbitMQ không cấu hình → bỏ qua (thông báo trong ứng dụng đã ghi trong transaction).
 */
@Injectable()
export class ApprovalEventsPublisher {
  private readonly logger = new Logger(ApprovalEventsPublisher.name);

  constructor(@Optional() private readonly rabbitmq?: RabbitMQService) {}

  async publishAll(events: ApprovalEventMessage[]) {
    if (!events.length || !this.rabbitmq?.isConnected) return;
    for (const event of events) {
      try {
        await this.rabbitmq.publish(RABBITMQ_EXCHANGE.APPROVAL, `approval.${event.type}`, event);
      } catch (err) {
        this.logger.warn(`Publish approval event ${event.type} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
