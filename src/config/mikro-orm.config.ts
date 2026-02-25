import { Options } from "@mikro-orm/core";
import { MongoDriver } from "@mikro-orm/mongodb";

const config: Options<MongoDriver> = {
  driver: MongoDriver,
  clientUrl: process.env.MONGO_URI || "mongodb://localhost:27017",
  dbName: "nestdb",
};

export default config;
