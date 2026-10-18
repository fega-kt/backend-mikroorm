import "dotenv/config";

export enum NodeEnv {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
  TEST = "test",
}

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || "development",
  CORE_PORT: Number(process.env.CORE_PORT) || 2000,
  APP_PORT: Number(process.env.APP_PORT) || 2001,
  CORE_JOB_PORT: Number(process.env.CORE_JOB_PORT) || 2002,
  APP_JOB_PORT: Number(process.env.APP_JOB_PORT) || 2003,
  API_PREFIX: process.env.API_PREFIX || "api",
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  DATABASE_URL: process.env.DATABASE_URL,
  DB_NAME: process.env.DB_NAME || "zhizhu",
  DB_SCHEMA: process.env.DB_SCHEMA || "public",
  SUPABASE_AUTH_DB_NAME: process.env.SUPABASE_AUTH_DB_NAME || "postgres",
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  /** Bucket riêng tư (tắt public access) cho tài liệu — truy cập qua link ký tạm */
  R2_PRIVATE_BUCKET: process.env.R2_PRIVATE_BUCKET,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  /** Số kết nối song song khi đọc cả object từ R2 (vd Document Server tải file); 1 hoặc 0 = tắt, đọc một luồng */
  R2_PARALLEL_DOWNLOADS: Number(process.env.R2_PARALLEL_DOWNLOADS ?? 6),
  /** Kích thước mỗi đoạn tải song song (MB) */
  R2_PARALLEL_CHUNK_SIZE_MB: Number(process.env.R2_PARALLEL_CHUNK_SIZE_MB) || 4,
  /** Địa chỉ Document Server để trình duyệt tải api.js (vd: https://docs.example.com) */
  ONLYOFFICE_URL: process.env.ONLYOFFICE_URL,
  /** Secret JWT của Document Server (cùng giá trị với JWT_SECRET của container) */
  ONLYOFFICE_JWT_SECRET: process.env.ONLYOFFICE_JWT_SECRET,
  /** Base URL để Document Server gọi về backend tải tệp (vd: http://host.docker.internal:2001/api) */
  ONLYOFFICE_FILE_BASE_URL: process.env.ONLYOFFICE_FILE_BASE_URL,
  /** Bắt buộc request tải tệp của Document Server mang JWT hợp lệ; chỉ tắt (false) khi đã xác nhận bản DS không gửi kèm */
  ONLYOFFICE_VERIFY_DS_AUTH: process.env.ONLYOFFICE_VERIFY_DS_AUTH !== "false",
  /** Service FileConverter (repo netcore) chuyển Word/Excel/PowerPoint sang PDF trước khi ký — vd http://fileconverter:8080 */
  FILE_CONVERTER_URL: process.env.FILE_CONVERTER_URL,
  /** Service ký số nội bộ (repo e-signature, .NET) — vd http://e-signature:8080 */
  ESIGN_URL: process.env.ESIGN_URL,
  /** Token dùng chung với service ký số (Signing__ServiceToken), ≥ 32 ký tự */
  ESIGN_SERVICE_TOKEN: process.env.ESIGN_SERVICE_TOKEN,
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3333",

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM || "noreply@example.com",
  /** Tên hiển thị trên header / footer email */
  APP_NAME: process.env.APP_NAME || "HRM",
  /** Logo PNG trên header email — hộp thư phải tải được nên là URL công khai (Gmail không hiện SVG) */
  APP_LOGO_URL: process.env.APP_LOGO_URL ?? "",

  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
  SUPABASE_JWT_PUBLISHABLE: process.env.SUPABASE_JWT_PUBLISHABLE,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_HOOK_SECRET: process.env.SUPABASE_HOOK_SECRET,
  SUPABASE_ACCESS_TOKEN_HOOK_SECRET: process.env.SUPABASE_ACCESS_TOKEN_HOOK_SECRET,

  /** Ký deviceId cấp cho trình duyệt (phát hiện đăng nhập thiết bị mới) — client không tự giả được */
  DEVICE_TOKEN_SECRET: process.env.DEVICE_TOKEN_SECRET,

  THROTTLE_TTL: Number(process.env.THROTTLE_TTL) || 60,
  THROTTLE_LIMIT: Number(process.env.THROTTLE_LIMIT) || 100,

  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID,
  CF_KV_API_TOKEN: process.env.CF_KV_API_TOKEN,

  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  CACHE_DRIVER: (process.env.CACHE_DRIVER as "redis" | "cloudflare") || "redis",

  RABBITMQ_URL: process.env.RABBITMQ_URL,
};
