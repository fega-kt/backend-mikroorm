import { AttachmentPreviewService } from "@core-service/services/pdf-preview/attachment-preview.service";
import { RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { ConsumerHandler, RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { ConsumeMessage } from "amqplib";

/** Nhận tệp PDF vừa upload xong và tạo bản xem tối ưu (mỗi lần một tệp — prefetch 1 — để không giữ nhiều tệp lớn trong bộ nhớ) */
@Injectable()
export class PdfPreviewConsumer implements OnModuleInit {
  private readonly logger = new Logger(PdfPreviewConsumer.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly previews: AttachmentPreviewService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.registerConsumer(RABBITMQ_QUEUES.ATTACHMENT_PDF_PREVIEW, this.handle.bind(this) as ConsumerHandler);
  }

  private async handle(msg: ConsumeMessage, ack: () => void, nack: (requeue?: boolean) => void) {
    let attachmentId: unknown;
    try {
      attachmentId = (JSON.parse(msg.content.toString()) as { attachmentId?: unknown }).attachmentId;
    } catch {
      attachmentId = undefined;
    }
    if (typeof attachmentId !== "string") {
      this.logger.warn(`Invalid PDF preview message: ${msg.content.toString().slice(0, 200)}`);
      nack(false);
      return;
    }
    // Lỗi xử lý tệp đã được ghi thành failed bên trong; lỗi ném ra (vd mất DB) thì vào DLQ, cron chạy bù sau
    await this.previews.process(attachmentId);
    ack();
  }
}
