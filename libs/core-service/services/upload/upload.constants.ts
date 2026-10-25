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

/** Đuôi file dạng văn bản, không có chữ ký nhị phân → file-type không nhận dạng được, đành dựa vào loại khai báo */
export const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".svg"]);

/**
 * Loại file-type trả về theo "vỏ" chứa chứ không phân biệt được Word / Excel / PowerPoint:
 * Office đời cũ là OLE2 (`application/x-cfb`); Office mới là ZIP — file-type thường nhận ra đúng loại,
 * nhưng file do vài công cụ tạo (thứ tự mục trong ZIP khác) chỉ nhận ra `application/zip`
 */
export const CONTAINER_MIME_EXTENSIONS: Record<string, string[]> = {
  "application/x-cfb": [".doc", ".xls", ".ppt"],
  "application/zip": [".docx", ".xlsx", ".pptx"],
};

export const MAX_FILENAME_LENGTH = 255;

export const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

/**
 * Trần dung lượng file upload thẳng lên bucket private (byte) — khớp maxSizeMb tối đa của cấu hình tệp tờ trình
 * và MAX_FILE_MB của service FileConverter (chuyển văn bản sang PDF để ký)
 */
export const MAX_PRIVATE_UPLOAD_SIZE = 200 * 1024 * 1024;

/** Thời hạn link upload (giây) — đủ để file lớn trên mạng chậm tải xong */
export const UPLOAD_URL_TTL_SECONDS = 30 * 60;

/** Thời hạn link tải (giây): trình duyệt mở link ngay sau khi nhận, chỉ cần đủ để bắt đầu tải */
export const DOWNLOAD_URL_TTL_SECONDS = 60;

/** Folder lưu bản xem của tệp (vd PDF đã sắp xếp lại): Previews/<key gốc>, tách khỏi file gốc */
export const PREVIEW_FOLDER = "Previews";

/** Key bản xem tương ứng với key file gốc */
export const previewKeyOf = (key: string) => `${PREVIEW_FOLDER}/${key}`;

/** Key bản PDF để tải về của tệp Word / Excel / PowerPoint (chuyển lần đầu người dùng tải, lưu lại cho lần sau) */
export const pdfDownloadKeyOf = (key: string) => `${PREVIEW_FOLDER}/${key}.pdf`;

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
