import { ENV, NodeEnv } from "@config/env.config";
import { getRequestInfo } from "@common/request-context";
import { type Options } from "@mikro-orm/core";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";

const isDev = ENV.NODE_ENV === NodeEnv.DEVELOPMENT;

const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  clientUrl: ENV.DATABASE_URL,
  dbName: ENV.DB_NAME,
  debug: isDev,
  logger: isDev
    ? (message: string) => {
        const info = getRequestInfo();
        const prefix = info ? `[${info.method} ${info.path}]` : "[no-req]";
        console.log(prefix, message);
      }
    : undefined,
};

export default config;
