export const EXT_MIME_MAP: Record<string, string[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  ".svg": ["image/svg+xml"],
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".ppt": ["application/vnd.ms-powerpoint"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".txt": ["text/plain"],
  ".csv": ["text/csv", "text/plain", "application/vnd.ms-excel"],
  ".mp4": ["video/mp4"],
  ".webm": ["video/webm"],
  ".mp3": ["audio/mpeg"],
  ".wav": ["audio/wav"],
};

export const ALLOWED_MIME_TYPES = [...new Set(Object.values(EXT_MIME_MAP).flat())];

export const MAX_FILENAME_LENGTH = 255;

export const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

/** Trần dung lượng file upload thẳng lên bucket private (byte) — khớp maxSizeMb tối đa của cấu hình tệp tờ trình */
export const MAX_PRIVATE_UPLOAD_SIZE = 100 * 1024 * 1024;

/** Thời hạn link upload (giây) — đủ để file lớn trên mạng chậm tải xong */
export const UPLOAD_URL_TTL_SECONDS = 30 * 60;

/** Thời hạn link tải (giây): trình duyệt mở link ngay sau khi nhận, chỉ cần đủ để bắt đầu tải */
export const DOWNLOAD_URL_TTL_SECONDS = 60;

/** Số byte đầu file đọc để nhận dạng loại nội dung thật */
export const SNIFF_BYTES = 4100;

/** Trần dung lượng file upload qua backend (multipart/form-data, giữ trong RAM) — file lớn phải đi bằng link ký */
export const MAX_PUBLIC_UPLOAD_SIZE = 10 * 1024 * 1024;

/** File lớn hơn mức này được upload theo từng phần (R2 multipart) để thử lại từng phần, không mất cả file khi đứt mạng */
export const MULTIPART_THRESHOLD = 5 * 1024 * 1024;

/** Dung lượng mỗi phần (byte); R2/S3 yêu cầu tối thiểu 5 MiB trừ phần cuối, các phần phải bằng nhau */
export const MULTIPART_PART_SIZE = 5 * 1024 * 1024;

/** Số phần tối đa khi hoàn tất upload, suy ra từ trần dung lượng */
export const MULTIPART_MAX_PARTS = Math.ceil(MAX_PRIVATE_UPLOAD_SIZE / MULTIPART_PART_SIZE);

/** Bản ghi upload dở (chưa xác nhận) quá thời gian này sẽ bị dọn (phút) */
export const PENDING_UPLOAD_MAX_AGE_MINUTES = 120;
