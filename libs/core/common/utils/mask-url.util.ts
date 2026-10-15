/** Che phần user:password trong URL kết nối (redis://, amqp://...) để ghi log mà không lộ mật khẩu; chưa cấu hình thì trả "(not set)" */
export function maskUrl(url: string | null | undefined): string {
  if (!url) return "(not set)";
  return url.replace(/:\/\/[^@]+@/, "://***@");
}
