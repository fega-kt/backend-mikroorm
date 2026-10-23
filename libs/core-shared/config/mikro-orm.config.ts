import { ENV, NodeEnv } from "@config/env.config";
import { getRequestInfo } from "@common/request-context";
import { type Options } from "@mikro-orm/core";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";

const isDev = ENV.NODE_ENV === NodeEnv.DEVELOPMENT;

const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  clientUrl: ENV.DATABASE_URL,
  dbName: ENV.DB_NAME,
  schema: ENV.DB_SCHEMA,
  // knex mặc định giữ min 2 kết nối rảnh mãi mãi; NAT / pooler cắt ngầm kết nối rảnh lâu nên query sau đó treo
  // ~15 phút tới ETIMEDOUT (job chạy thưa). min 0 + idle 30s để kết nối rảnh được đóng và mở lại khi cần.
  pool: { min: 0, max: 10, idleTimeoutMillis: 30_000, acquireTimeoutMillis: 30_000 },
  driverOptions: {
    connection: {
      // TCP keepalive giữ kết nối sống qua NAT và phát hiện kết nối chết sớm
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // Chặn phía client: socket chết thì query lỗi sau 2 phút thay vì treo tới khi kernel bỏ cuộc
      query_timeout: 120_000,
    },
  },
  debug: isDev,
  logger: isDev
    ? (message: string) => {
        const info = getRequestInfo();
        const prefix = info ? `[${info.requestId}] [${info.method} ${info.path}]` : "[no-req]";
        console.log(prefix, message);
      }
    : undefined,
};

export default config;
