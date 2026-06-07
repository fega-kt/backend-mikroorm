import { ENV } from "@config/env.config";
import { type Options } from "@mikro-orm/core";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";

const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  clientUrl: ENV.DATABASE_URL,
};

export default config;
