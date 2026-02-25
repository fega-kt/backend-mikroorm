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
      version: process.env.npm_package_version,
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }
}
