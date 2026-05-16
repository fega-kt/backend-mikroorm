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
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017",
  DB_NAME: process.env.DB_NAME || "db_name",
  JWT_SECRET: process.env.JWT_SECRET || "secret",

  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3333",

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM || "noreply@example.com",

  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
  SUPABASE_JWT_PUBLISHABLE: process.env.SUPABASE_JWT_PUBLISHABLE,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  THROTTLE_TTL: Number(process.env.THROTTLE_TTL) || 60,
  THROTTLE_LIMIT: Number(process.env.THROTTLE_LIMIT) || 100,

  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID,
  CF_KV_API_TOKEN: process.env.CF_KV_API_TOKEN,
};
