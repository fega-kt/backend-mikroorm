import type { MikroORM } from "@mikro-orm/core";
import type { PostgreSqlConnection } from "@mikro-orm/postgresql";

/** Khóa advisory dùng chung cho mọi app (core, app…) khi đồng bộ schema */
const SCHEMA_SYNC_LOCK_ID = 727_001;

/**
 * updateSchema({ safe: true }) nhưng chạy tuần tự giữa các app cùng khởi động (pnpm dev / deploy song song).
 * Các app dùng chung bảng (vd: notifications) nếu đồng bộ cùng lúc sẽ cùng sửa một constraint và lỗi
 * "constraint ... already exists". Khóa giữ trong một transaction riêng; xong thì commit để nhả khóa.
 */
export async function syncSchema(orm: MikroORM) {
  const knex = (orm.em.getConnection() as PostgreSqlConnection).getKnex();
  await knex.transaction(async (trx) => {
    // Process bị kill khi đang giữ khóa thì Postgres tự nhả sau 5 phút; không để ngắn hơn thời gian chạy updateSchema
    await trx.raw("set local idle_in_transaction_session_timeout = '5min'");
    await trx.raw("select pg_advisory_xact_lock(?)", [SCHEMA_SYNC_LOCK_ID]);
    await orm.schema.updateSchema({ safe: true });
  });
}
