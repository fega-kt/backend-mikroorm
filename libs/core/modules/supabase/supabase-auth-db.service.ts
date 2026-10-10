import { ENV } from "@config/env.config";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";

/**
 * Kết nối chỉ đọc tới database của Supabase (schema auth: users, sessions, audit_log_entries...).
 * Database này (SUPABASE_AUTH_DB_NAME) khác database của app (DB_NAME) trên cùng server và Postgres không query chéo database,
 * nên cần pool riêng. Dùng chung host, user, mật khẩu với DATABASE_URL; pool chỉ tạo ở lần query đầu tiên.
 */
@Injectable()
export class SupabaseAuthDbService implements OnModuleDestroy {
  private pool?: Pool;

  async query<R extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<R[]> {
    const { rows } = await this.getPool().query<R>(sql, params);
    return rows;
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  private getPool(): Pool {
    if (!this.pool) {
      const url = new URL(ENV.DATABASE_URL);
      url.pathname = `/${ENV.SUPABASE_AUTH_DB_NAME}`;
      this.pool = new Pool({ connectionString: url.toString(), max: 1, idleTimeoutMillis: 30_000 });
    }
    return this.pool;
  }
}
