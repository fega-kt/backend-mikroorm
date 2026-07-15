import { EntityManager } from "@mikro-orm/core";
import { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
  constructor(
    private readonly em: EntityManager,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  async check() {
    let database = "ok";

    try {
      await this.em.getConnection().execute("SELECT 1");
    } catch {
      database = "down";
    }

    return {
      status: "ok",
      database,
      rabbitmq: this.rabbitmq.isConnected ? "ok" : "down",
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }

  async version() {
    return {
      commit: process.env.GIT_COMMIT || "dev",
      author: process.env.GIT_AUTHOR || "unknown",
      branch: process.env.GIT_BRANCH,
      message: process.env.GIT_MESSAGE,
      buildTime: process.env.BUILD_TIME,
      version: process.env.npm_package_version,
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }
}
