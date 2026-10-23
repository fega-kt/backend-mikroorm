/** Cách hiển thị một tệp khi xem trong hệ thống (người xem không được tải về) */
export enum FileViewKind {
  /** Xem bằng OnlyOffice Document Server (iframe) */
  Office = "office",
  /** PDF: trình xem pdf.js ở client, tải theo từng đoạn (Range) nên trang đầu hiện ngay */
  Pdf = "pdf",
  /** Ảnh: thẻ <img> */
  Image = "image",
  /** Video: thẻ <video> không có nút tải */
  Video = "video",
  /** Âm thanh: thẻ <audio> không có nút tải */
  Audio = "audio",
  /** Không xem được trong hệ thống */
  Unsupported = "unsupported",
}

/** Lý do không xem được (kèm kind = unsupported) — không có thì là loại tệp chưa hỗ trợ */
export enum FileViewUnavailableReason {
  /** Vượt ngưỡng xem trước bằng Document Server: phải tải về */
  TooLarge = "too-large",
}

/** documentType của OnlyOffice theo đuôi file */
export type OfficeDocumentType = "word" | "cell" | "slide" | "pdf";

const OFFICE_EXTENSIONS: Record<string, OfficeDocumentType> = {
  doc: "word",
  docx: "word",
  txt: "word",
  xls: "cell",
  xlsx: "cell",
  csv: "cell",
  ppt: "slide",
  pptx: "slide",
};

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
const VIDEO_EXTENSIONS = ["mp4", "webm"];
const AUDIO_EXTENSIONS = ["mp3", "wav"];
// svg không xem trước: file có thể chứa script, mở trực tiếp trên trình duyệt sẽ chạy cùng origin

export interface FileViewTarget {
  kind: FileViewKind;
  /** Đuôi file (chữ thường, không dấu chấm) */
  ext: string;
  /** Chỉ có khi kind = office */
  documentType?: OfficeDocumentType;
}

/** Quyết định tệp nào xem được và xem bằng cách nào (theo đuôi file; loại nội dung thật đã được kiểm lúc upload) */
export function resolveFileViewTarget(filename: string): FileViewTarget {
  const ext = filename.includes(".") ? (filename.split(".").pop() ?? "").toLowerCase() : "";
  const documentType = OFFICE_EXTENSIONS[ext];
  if (documentType) return { kind: FileViewKind.Office, ext, documentType };
  if (ext === "pdf") return { kind: FileViewKind.Pdf, ext };
  if (IMAGE_EXTENSIONS.includes(ext)) return { kind: FileViewKind.Image, ext };
  if (VIDEO_EXTENSIONS.includes(ext)) return { kind: FileViewKind.Video, ext };
  if (AUDIO_EXTENSIONS.includes(ext)) return { kind: FileViewKind.Audio, ext };
  return { kind: FileViewKind.Unsupported, ext };
}

/** Thời hạn token cho Document Server tải file (giây): chỉ cần đủ cho một lần tải */
export const OFFICE_FILE_TOKEN_TTL_SECONDS = 180;
/** Thời hạn token cho PDF/ảnh/video/âm thanh (giây): phải đủ để đọc, cuộn và tua */
export const NATIVE_FILE_TOKEN_TTL_SECONDS = 30 * 60;
