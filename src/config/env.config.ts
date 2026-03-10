import "dotenv/config";

export enum NodeEnv {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
  TEST = "test",
}

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 3000,
  API_PREFIX: process.env.API_PREFIX || "api",
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017",
  DB_NAME: process.env.DB_NAME || "db_name",
  JWT_SECRET: process.env.JWT_SECRET || "secret",

  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
};
