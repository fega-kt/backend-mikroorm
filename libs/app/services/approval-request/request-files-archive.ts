import path from "node:path";
import type { ApprovalRequestFileEntity } from "../../entities/approval-request-file";
import { RequestFileCategory } from "./request-file.constants";

/** signed: bản ký số (bản cuối) của văn bản tờ trình; original: tệp gốc của văn bản + tài liệu đính kèm */
export enum RequestArchiveKind {
  Signed = "signed",
  Original = "original",
}

/** Giới hạn một lần tải: zip đi qua backend nên chặn lượt tải quá lớn */
export const MAX_ARCHIVE_FILES = 100;
export const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;
/** Link tải zip dùng một lần, sống rất ngắn: client mở ngay sau khi nhận */
export const ARCHIVE_TOKEN_TTL_SECONDS = 60;

/** Thư mục trong zip cho bộ tệp gốc */
const ORIGINAL_FOLDERS: Record<RequestFileCategory, string> = {
  [RequestFileCategory.Documents]: "Văn bản tờ trình",
  [RequestFileCategory.Attachments]: "Tài liệu đính kèm",
};

export interface ArchiveEntry {
  /** Object trên bucket private */
  key: string;
  /** Đường dẫn trong zip */
  name: string;
  size: number;
}

/** Tên trong zip không trùng: trùng thì thêm " (2)", " (3)"… trước đuôi file (so không phân biệt hoa thường) */
function uniqueName(name: string, used: Set<string>) {
  const ext = path.posix.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${stem} (${i})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Tên tệp an toàn trong zip: không cho thư mục / ký tự đường dẫn lọt vào (tên do người dùng đặt) */
const safeFilename = (filename: string) => filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "file";

/**
 * Danh sách tệp cho zip từ bộ tệp của một vòng (đã sắp theo category, position):
 * - signed: bản hiện tại của từng văn bản (PDF chuyển đổi / bản ký mới nhất; chưa chuyển thì là tệp gốc), để phẳng;
 * - original: tệp gốc, chia thư mục "Văn bản tờ trình" / "Tài liệu đính kèm".
 */
export function buildArchiveEntries(rows: ApprovalRequestFileEntity[], kind: RequestArchiveKind): ArchiveEntry[] {
  const used = new Set<string>();
  const picked =
    kind === RequestArchiveKind.Signed
      ? rows.filter((row) => row.category === RequestFileCategory.Documents).map((row) => ({ file: row.current, folder: "" }))
      : rows.map((row) => ({ file: row.original, folder: `${ORIGINAL_FOLDERS[row.category]}/` }));
  return picked.map(({ file, folder }) => ({
    key: file.key,
    name: uniqueName(`${folder}${safeFilename(file.filename)}`, used),
    size: file.size,
  }));
}

/** Tên file zip tải về: mã tờ trình + loại (vd ESIGN-2026-0002-ban-ky-so.zip) */
export function archiveFilename(code: string | undefined, kind: RequestArchiveKind) {
  const base = (code || "to-trinh").replace(/[^A-Za-z0-9._-]/g, "_");
  return `${base}-${kind === RequestArchiveKind.Signed ? "ban-ky-so" : "tep-goc"}.zip`;
}
