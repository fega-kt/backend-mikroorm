import { EntityManager } from "@mikro-orm/core";
import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
  constructor(private readonly em: EntityManager) {}

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
      buildTime: process.env.BUILD_TIME, // 🔥 quan trọng
      version: process.env.npm_package_version,
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }
}
