import { ENV } from "@config/env.config";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import * as amqp from "amqplib";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "./rabbitmq.constants";

export type ConsumerHandler = (msg: amqp.ConsumeMessage, ack: () => void, nack: (requeue?: boolean) => void) => Promise<void>;

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private model: amqp.RecoveringChannelModel | null = null;
  private currentChannelModel: amqp.ChannelModel | null = null;
  /** Confirm channel: publishConfirmed chờ broker xác nhận đã nhận message */
  private publishChannel: amqp.ConfirmChannel | null = null;
  private readonly registeredConsumers: Array<{ queue: string; handler: ConsumerHandler }> = [];
  private _isConnected = false;

  async onModuleInit() {
    const url = ENV.RABBITMQ_URL;
    if (!url) {
      this.logger.warn("RABBITMQ_URL not configured — RabbitMQ disabled");
      return;
    }
    this.logger.log(`Connecting to RabbitMQ: ${this.maskUrl(url)}`);
    await this.connect(url);
  }

  async onModuleDestroy() {
    await this.model?.close().catch(() => {});
  }

  private async connect(url: string) {
    this.model = await amqp.connect(url, {
      recovery: {
        maxRetries: Infinity,
        initialDelay: 1000,
        maxDelay: 30000,
        factor: 2,
        setup: async (channelModel: amqp.ChannelModel) => {
          try {
            this.currentChannelModel = channelModel;
            this.publishChannel = await channelModel.createConfirmChannel();
            this.publishChannel.on("error", (err: Error) => {
              this.logger.warn(`RabbitMQ publish channel error: ${err.message}`);
            });
            await this.setupTopology(this.publishChannel);
            await this.setupApprovalTopology(this.publishChannel);
            this._isConnected = true;

            for (const { queue, handler } of this.registeredConsumers) {
              await this.startConsuming(channelModel, queue, handler);
            }

            this.logger.log(`RabbitMQ connected and topology ready: ${this.maskUrl(url)}`);
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.logger.error(`RabbitMQ setup failed: ${error}`);
            throw err;
          }
        },
      },
    });

    this.model.on("disconnect", (err) => {
      this._isConnected = false;
      this.publishChannel = null;
      this.currentChannelModel = null;
      this.logger.warn(`RabbitMQ disconnected: ${err.message}`);
    });

    this.model.on("reconnect-scheduled", ({ attempt, delay }: { attempt: number; delay: number }) => {
      this.logger.log(`RabbitMQ reconnect scheduled — attempt ${attempt} in ${delay}ms`);
    });

    this.model.on("reconnect-failed", (err: Error) => {
      this.logger.error("RabbitMQ reconnect failed permanently", err.message);
    });

    this.model.on("error", (err: Error) => {
      this.logger.warn(`RabbitMQ connection error: ${err.message}`);
    });
  }

  private maskUrl(url: string): string {
    return url.replace(/:\/\/[^@]+@/, "://***@");
  }

  private async setupTopology(ch: amqp.Channel) {
    await ch.assertExchange(RABBITMQ_EXCHANGE.NOTIFICATION, "direct", { durable: true });
    await ch.assertExchange(RABBITMQ_EXCHANGE.NOTIFICATION_DLX, "direct", { durable: true });

    await ch.assertQueue(RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": RABBITMQ_EXCHANGE.NOTIFICATION_DLX,
        "x-dead-letter-routing-key": RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER_DLQ,
      },
    });
    await ch.bindQueue(
      RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER,
      RABBITMQ_EXCHANGE.NOTIFICATION,
      RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER,
    );

    await ch.assertQueue(RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER_DLQ, { durable: true });
    await ch.bindQueue(
      RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER_DLQ,
      RABBITMQ_EXCHANGE.NOTIFICATION_DLX,
      RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER_DLQ,
    );
  }

  private async setupApprovalTopology(ch: amqp.Channel) {
    await ch.assertExchange(RABBITMQ_EXCHANGE.APPROVAL, "topic", { durable: true });
    await ch.assertQueue(RABBITMQ_QUEUES.APPROVAL_EMAIL, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": RABBITMQ_EXCHANGE.NOTIFICATION_DLX,
        "x-dead-letter-routing-key": RABBITMQ_QUEUES.APPROVAL_EMAIL_DLQ,
      },
    });
    await ch.bindQueue(RABBITMQ_QUEUES.APPROVAL_EMAIL, RABBITMQ_EXCHANGE.APPROVAL, "approval.#");
    // Gửi lại một email từ hàng đợi gửi mail (activity-log-queue retry)
    await ch.assertExchange(RABBITMQ_EXCHANGE.NOTIFICATION, "direct", { durable: true });
    await ch.bindQueue(RABBITMQ_QUEUES.APPROVAL_EMAIL, RABBITMQ_EXCHANGE.NOTIFICATION, RABBITMQ_QUEUES.APPROVAL_EMAIL);
    await ch.assertQueue(RABBITMQ_QUEUES.APPROVAL_EMAIL_DLQ, { durable: true });
    await ch.bindQueue(RABBITMQ_QUEUES.APPROVAL_EMAIL_DLQ, RABBITMQ_EXCHANGE.NOTIFICATION_DLX, RABBITMQ_QUEUES.APPROVAL_EMAIL_DLQ);
  }

  async publish(exchange: string, routingKey: string, message: unknown): Promise<boolean> {
    if (!this.publishChannel) {
      this.logger.warn(`RabbitMQ not connected — message dropped (${exchange}/${routingKey})`);
      return false;
    }
    return this.publishChannel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: "application/json",
      timestamp: Date.now(),
    });
  }

  /** Publish và chờ broker xác nhận (dùng cho outbox — chỉ đánh "đã đẩy" khi chắc chắn broker đã nhận) */
  async publishConfirmed(exchange: string, routingKey: string, message: unknown, messageId?: string, timeoutMs = 10_000): Promise<void> {
    const ch = this.publishChannel;
    if (!ch) throw new Error("RabbitMQ not connected");
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          ch.publish(
            exchange,
            routingKey,
            Buffer.from(JSON.stringify(message)),
            { persistent: true, contentType: "application/json", timestamp: Date.now(), messageId },
            (err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()),
          );
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`RabbitMQ confirm timeout after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async registerConsumer(queue: string, handler: ConsumerHandler): Promise<void> {
    this.registeredConsumers.push({ queue, handler });
    if (this.currentChannelModel) {
      await this.startConsuming(this.currentChannelModel, queue, handler);
    }
  }

  private async startConsuming(channelModel: amqp.ChannelModel, queue: string, handler: ConsumerHandler) {
    const ch = await channelModel.createChannel();
    ch.on("error", (err: Error) => {
      this.logger.warn(`RabbitMQ consumer channel error (${queue}): ${err.message}`);
    });
    await ch.prefetch(1);
    // consume callback phải là void — dùng .catch() thay vì async
    await ch.consume(queue, (msg) => {
      if (!msg) return;
      handler(
        msg,
        () => ch.ack(msg),
        (requeue = false) => ch.nack(msg, false, requeue),
      ).catch((err) => {
        this.logger.error(`Uncaught consumer error on queue ${queue}`, err);
        ch.nack(msg, false, false);
      });
    });
    this.logger.log(`Consumer registered on queue: ${queue}`);
  }

  get isConnected(): boolean {
    return this._isConnected;
  }
}
