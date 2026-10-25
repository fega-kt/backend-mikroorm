import { createHash } from "crypto";

/** Key cache của access token (băm, không lưu token gốc) */
export const tokenCacheKey = (token: string) => AuthCacheKey.token(createHash("sha256").update(token).digest("hex"));

export interface AccessTokenClaims {
  session_id?: string;
  /** Hết hạn (giây) */
  exp?: number;
  /** Supabase: phương thức xác thực kèm thời điểm (giây) */
  amr?: Array<{ method: string; timestamp: number }>;
}

/** Chỉ đọc payload, không kiểm chữ ký — dùng cho token đã được Supabase xác thực */
export function decodeTokenClaims(token: string): AccessTokenClaims | undefined {
  try {
    const payload = token.split(".")[1];
    return payload ? (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AccessTokenClaims) : undefined;
  } catch {
    return undefined;
  }
}

/** Cache keys cho auth module — tập trung để tránh typo và dễ tra cứu */
export const AuthCacheKey = {
  /** OTP quên mật khẩu — xác thực trước khi reset password */
  forgotPasswordOtp: (email: string) => `otp:${email}`,
  /** Đếm số lần gửi OTP quên mật khẩu trong ngày (giới hạn 5 lần/ngày) */
  forgotPasswordSendCount: (email: string, date: string) => `otp_send:${email}:${date}`,
  /** OTP đăng nhập — xác thực danh tính khi login không cần password */
  loginOtp: (email: string) => `otp:login:${email}`,
  /** Rate limit gửi OTP đăng nhập (giới hạn 5 lần/giờ) */
  loginOtpRateLimit: (email: string) => `otp:login:ratelimit:${email}`,
  /** Token đã verify với Supabase → { userId, email } */
  token: (tokenHash: string) => `cache:auth:token:${tokenHash}`,
  /** Thông tin user + permissions của guard — xoá khi user thay đổi để request sau load lại */
  user: (userId: string) => `cache:auth:user:${userId}`,
  /**
   * @deprecated Mốc online cuối (ms) guard từng ghi mỗi request, TTL 400 ngày — đã thay bằng users.lastActiveAt.
   * Chỉ còn cron nhắc đăng nhập đọc để điền lastActiveAt cho user cũ; xoá khi các key này hết hạn.
   */
  lastActiveLegacy: (userId: string) => `user:last-active:${userId}`,
  /** Đánh dấu đã ghi users.lastActiveAt gần đây — guard chỉ ghi DB khi key hết hạn */
  lastActiveSynced: (userId: string) => `auth:last-active-synced:${userId}`,
  /** deviceId của phiên đăng nhập (session_id trong JWT) — có nghĩa là phiên đã kiểm tra thiết bị mới */
  deviceSession: (sessionId: string) => `auth:device-session:${sessionId}`,
} as const;

/** TTL cache auth (giây) */
export const AUTH_CACHE_TTL = 300;

export const AuthOtpConfig = {
  /** TTL OTP quên mật khẩu (giây) */
  forgotPasswordTtl: 60,
  /** TTL OTP đăng nhập (giây) */
  loginOtpTtl: 300,
  /** Số lần nhập sai OTP đăng nhập tối đa trước khi bị khóa */
  loginOtpMaxAttempts: 3,
  /** Số lần gửi OTP đăng nhập tối đa trong 1 giờ */
  loginOtpRateLimit: 5,
} as const;
