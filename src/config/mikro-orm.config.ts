import { Options } from "@mikro-orm/core";
import { MongoDriver } from "@mikro-orm/mongodb";
import "dotenv/config";

const config: Options<MongoDriver> = {
  driver: MongoDriver,
  clientUrl: process.env.MONGO_URI || "mongodb://localhost:27017",
  dbName: process.env.DB_NAME,
};

export default config;
