import { RequestPdfService } from "@app-domain/services/e-signature/request-pdf.service";
import { RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { type ConsumerHandler, RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { RedisService } from "@modules/redis/redis.service";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { ConsumeMessage } from "amqplib";

const LOCK_KEY = "lock:approval:file-convert";
/** Ngắn hơn chu kỳ cron để lượt sau không bị chặn nếu instance giữ khóa chết giữa chừng */
const LOCK_TTL_MS = 50 * 1000;
const BATCH = 20;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Chuyển sẵn "Văn bản tờ trình" (Word / Excel / PowerPoint) sang PDF khi tờ trình tới bước bắt buộc ký,
 * để người duyệt mở hộp "Ký và duyệt" không phải chờ. Engine đánh dấu văn bản cần chuyển lúc kích hoạt bước;
 * - consumer: nhận event approval.request.step_pending → chuyển ngay;
 * - cron mỗi phút: thử lại văn bản lỗi đến hạn (15, 15, 60 phút) và làm bù khi lỡ event.
 * Lỗi không ảnh hưởng duyệt: hộp ký vẫn chuyển lại nếu chưa có bản PDF.
 */
@Injectable()
export class ApprovalFileConvertJob implements OnModuleInit {
  private readonly logger = new Logger(ApprovalFileConvertJob.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly redis: RedisService,
    private readonly pdf: RequestPdfService,
  ) {}

  async onModuleInit() {
    await this.rabbitmq.registerConsumer(RABBITMQ_QUEUES.APPROVAL_FILE_CONVERT, this.handle.bind(this) as ConsumerHandler);
  }

  private async handle(msg: ConsumeMessage, ack: () => void) {
    let requestId: string | undefined;
    try {
      requestId = (JSON.parse(msg.content.toString()) as { requestId?: string }).requestId;
    } catch {
      return ack();
    }
    if (!requestId) return ack();
    try {
      // Bước không bắt buộc ký: không có văn bản nào đang chờ chuyển → không làm gì
      const result = await this.pdf.processRequest(requestId, { ignoreSchedule: true });
      if (result.converted) this.logger.log(`Pre-converted ${result.converted} document(s) of request ${requestId}`);
    } catch (err) {
      // Không requeue: cron thử lại theo convertNextAt
      this.logger.error(`Pre-converting documents of request ${requestId} failed: ${errorMessage(err)}`);
    }
    ack();
  }

  @Cron("0 * * * * *")
  async retryDue() {
    const locked = await this.redis.acquireLock(LOCK_KEY, LOCK_TTL_MS);
    if (locked === false) return;
    const requestIds = await this.pdf.dueRequestIds(BATCH);
    for (const requestId of requestIds) {
      try {
        await this.pdf.processRequest(requestId);
      } catch (err) {
        this.logger.error(`Retrying conversion of request ${requestId} failed: ${errorMessage(err)}`);
      }
    }
  }
}
