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
  private publishChannel: amqp.Channel | null = null;
  private readonly registeredConsumers: Array<{ queue: string; handler: ConsumerHandler }> = [];
  private _isConnected = false;

  async onModuleInit() {
    const url = ENV.RABBITMQ_URL;
    if (!url) {
      this.logger.warn("RABBITMQ_URL not configured — RabbitMQ disabled");
      return;
    }
    this.logger.log(`Connecting to RabbitMQ: ${url.replace(/:\/\/[^@]+@/, "://***@")}`);
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
            this.publishChannel = await channelModel.createChannel();
            this.publishChannel.on("error", (err: Error) => {
              this.logger.warn(`RabbitMQ publish channel error: ${err.message}`);
            });
            await this.setupTopology(this.publishChannel);
            this._isConnected = true;

            for (const { queue, handler } of this.registeredConsumers) {
              await this.startConsuming(channelModel, queue, handler);
            }

            this.logger.log("RabbitMQ connected and topology ready");
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
