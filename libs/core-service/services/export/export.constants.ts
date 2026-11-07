/** Số dòng đọc / ghi mỗi lô */
export const EXPORT_BATCH_SIZE = 1000;

/** Dưới ngưỡng này tải ngay (stream trong một request); từ ngưỡng trở lên chạy nền, gửi thông báo khi xong */
export const EXPORT_INSTANT_MAX_ROWS = 50_000;

/** Số dòng tối đa mỗi file xlsx; nhiều hơn thì tách thành nhiều file gói trong một zip */
export const EXPORT_PART_ROWS = 500_000;

/** File xuất giữ trên kho bao nhiêu ngày rồi bị xóa */
export const EXPORT_RETENTION_DAYS = 7;

/** Job chạy quá lâu thì dừng và báo lỗi */
export const EXPORT_JOB_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/** Job không báo còn sống quá lâu (worker chết giữa chừng) thì coi là treo */
export const EXPORT_STALE_HEARTBEAT_MS = 10 * 60 * 1000;

/** Worker báo còn sống mỗi chừng này (phải ngắn hơn nhiều so với EXPORT_STALE_HEARTBEAT_MS) — kể cả lúc đóng zip, tải lên kho, gửi email */
export const EXPORT_HEARTBEAT_INTERVAL_MS = 60 * 1000;

/** Số job chạy song song tối đa trên toàn hệ thống */
export const EXPORT_MAX_CONCURRENT_JOBS = 1;

/** File nhỏ hơn hoặc bằng ngưỡng này mới đính kèm vào email (lớn hơn: email chỉ có link vào hệ thống) */
export const EXPORT_EMAIL_ATTACH_MAX_BYTES = 10 * 1024 * 1024;

/** Cập nhật tiến độ + kiểm tra hủy / quá hạn sau mỗi bao nhiêu lô */
export const EXPORT_PROGRESS_EVERY_BATCHES = 10;

/** Thư mục gốc của file xuất trên kho private (xem STORAGE_PATH.EXPORTS) */
export const EXPORT_MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const EXPORT_MIME_ZIP = "application/zip";
