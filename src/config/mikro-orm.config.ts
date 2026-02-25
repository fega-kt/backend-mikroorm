import { ENV } from "@config/env.config";
import { Options } from "@mikro-orm/core";
import { MongoDriver } from "@mikro-orm/mongodb";

const config: Options<MongoDriver> = {
  driver: MongoDriver,
  clientUrl: ENV.MONGO_URI,
  dbName: ENV.DB_NAME,
};

export default config;
