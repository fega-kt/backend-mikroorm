/**
 * Kiểm "ruột" văn bản Office mới (docx / xlsx / pptx = ZIP) bằng mục lục ZIP (central directory) ở cuối file:
 * chỉ đọc vài chục KB cuối, không giải nén — bắt được file ZIP khác đổi đuôi và file bị cắt cụt.
 * XML hỏng bên trong thì không bắt được (chỉ lộ khi chuyển PDF).
 */

/** Thành phần bắt buộc theo đuôi (tên trong ZIP, so không phân biệt hoa thường như quy ước OPC) */
const REQUIRED_PARTS: Record<string, string[]> = {
  ".docx": ["[content_types].xml", "word/document.xml"],
  ".xlsx": ["[content_types].xml", "xl/workbook.xml"],
  ".pptx": ["[content_types].xml", "ppt/presentation.xml"],
};

/** Bản ghi kết thúc ZIP (EOCD) dài 22 byte + chú thích tối đa 65535 byte */
const EOCD_MIN = 22;
const EOCD_MAX = EOCD_MIN + 0xffff;
/** Mục lục lớn hơn mức này thì thôi không đọc (văn bản bình thường chỉ vài chục KB) */
const MAX_DIRECTORY_SIZE = 16 * 1024 * 1024;

const EOCD_SIG = 0x06054b50;
const ENTRY_SIG = 0x02014b50;

/** ok: đủ thành phần; invalid: không phải ZIP đọc được / thiếu thành phần; unknown: không kiểm được (ZIP64, mục lục quá lớn) → cho qua */
export type OfficeZipCheck = "ok" | "invalid" | "unknown";

export const hasOfficeZipParts = (ext: string) => ext in REQUIRED_PARTS;

/** `read(start, end)` đọc byte [start, end) của file */
export async function checkOfficeZip(
  ext: string,
  size: number,
  read: (start: number, end: number) => Promise<Uint8Array>,
): Promise<OfficeZipCheck> {
  const required = REQUIRED_PARTS[ext];
  if (!required) return "ok";
  if (size < EOCD_MIN) return "invalid";

  const tailStart = Math.max(0, size - EOCD_MAX);
  const tail = Buffer.from(await read(tailStart, size));
  // Tìm EOCD từ cuối lên (chú thích ZIP nằm sau EOCD)
  let eocd = -1;
  for (let i = tail.length - EOCD_MIN; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  // Không có EOCD: file bị cắt cụt hoặc không phải ZIP
  if (eocd < 0) return "invalid";

  const entries = tail.readUInt16LE(eocd + 10);
  const dirSize = tail.readUInt32LE(eocd + 12);
  const dirOffset = tail.readUInt32LE(eocd + 16);
  // ZIP64: các trường là 0xFFFF / 0xFFFFFFFF, vị trí thật nằm ở bản ghi khác → không kiểm, cho qua
  if (entries === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) return "unknown";
  if (dirOffset + dirSize > tailStart + eocd) return "invalid";
  if (dirSize > MAX_DIRECTORY_SIZE) return "unknown";

  const dir =
    dirOffset >= tailStart
      ? tail.subarray(dirOffset - tailStart, dirOffset - tailStart + dirSize)
      : Buffer.from(await read(dirOffset, dirOffset + dirSize));
  const names = new Set<string>();
  for (let pos = 0; pos + 46 <= dir.length && dir.readUInt32LE(pos) === ENTRY_SIG; ) {
    const nameLength = dir.readUInt16LE(pos + 28);
    const extraLength = dir.readUInt16LE(pos + 30);
    const commentLength = dir.readUInt16LE(pos + 32);
    names.add(dir.toString("utf8", pos + 46, pos + 46 + nameLength).toLowerCase());
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return required.every((part) => names.has(part)) ? "ok" : "invalid";
}
