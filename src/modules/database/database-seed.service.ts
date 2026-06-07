import { SYSTEM_DEPARTMENT_ID, SYSTEM_PRINCIPAL_ID, SYSTEM_USER_ID } from "@common/constants/system.constant";
import { EntityManager } from "@mikro-orm/core";
import { PostgreSqlConnection } from "@mikro-orm/postgresql";
import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import type { Knex } from "knex";

@Injectable()
export class DatabaseSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeedService.name);

  constructor(private readonly em: EntityManager) {}

  async onApplicationBootstrap() {
    const knex = (this.em.getConnection() as PostgreSqlConnection).getKnex();
    await knex.transaction(async (trx: Knex.Transaction) => {
      await trx.raw("SET LOCAL session_replication_role = replica");
      await trx.raw(
        `INSERT INTO departments (id, created_at, updated_at, deleted, created_by_id, updated_by_id, code, name, status)
         VALUES ('${SYSTEM_DEPARTMENT_ID}', NOW(), NOW(), true, '${SYSTEM_USER_ID}', '${SYSTEM_USER_ID}', 'SYS', 'System', 0)
         ON CONFLICT (id) DO NOTHING`,
      );
      await trx.raw(
        `INSERT INTO users (id, created_at, updated_at, deleted, created_by_id, updated_by_id, login_name, full_name, department_id, is_active)
         VALUES ('${SYSTEM_USER_ID}', NOW(), NOW(), true, '${SYSTEM_USER_ID}', '${SYSTEM_USER_ID}', 'system@local', 'System', '${SYSTEM_DEPARTMENT_ID}', false)
         ON CONFLICT (id) DO NOTHING`,
      );
      await trx.raw(
        `INSERT INTO principals (id, created_at, updated_at, deleted, created_by_id, updated_by_id, name, type, user_id)
         VALUES ('${SYSTEM_PRINCIPAL_ID}', NOW(), NOW(), true, '${SYSTEM_USER_ID}', '${SYSTEM_USER_ID}', 'System', 'user', '${SYSTEM_USER_ID}')
         ON CONFLICT (id) DO NOTHING`,
      );
    });
    this.logger.log("✅ System seed verified\n");
  }
}
