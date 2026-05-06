import { EntityManager } from "@mikro-orm/mongodb";
import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
  constructor(private readonly em: EntityManager) {}

  async check() {
    let database = "ok";

    try {
      // ping mongodb
      await this.em.getConnection().execute("ping");
    } catch (error) {
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
