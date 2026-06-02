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
} as const;

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
