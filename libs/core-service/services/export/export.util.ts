/**
 * Phần thuần của xuất Excel: chống chèn công thức, giờ Việt Nam, chọn cột, duyệt dữ liệu theo khóa (keyset).
 * Không phụ thuộc DB / HTTP để test được.
 */

/** Ngôn ngữ nhãn (tiêu đề cột, nhãn trạng thái) của file xuất */
export const EXPORT_LANGS = ["vi-VN", "en-US", "zh-CN"] as const;
export type ExportLang = (typeof EXPORT_LANGS)[number];

/** Giá trị một ô: kiểu rõ ràng để ngày / số không bị ghi thành chữ */
export type ExportCell = string | number | Date | null | undefined;

export interface ExportColumn<T> {
  /** Khóa cột — client chọn cột theo khóa này, chỉ khóa có trong danh sách mới được nhận */
  key: string;
  /** Tiêu đề mặc định theo ngôn ngữ khi client không gửi nhãn */
  header: Record<ExportLang, string>;
  width?: number;
  /** Ngày giờ ghi dạng ngày của Excel (theo giờ Việt Nam); date: chỉ ngày */
  type?: "text" | "number" | "date" | "datetime";
  value: (row: T, lang: ExportLang) => ExportCell;
}

/** Cột client chọn: khóa + nhãn hiển thị (nhãn có thể trống → dùng nhãn mặc định) */
export interface RequestedColumn {
  key: string;
  header?: string;
}

export interface ResolvedColumn<T> {
  column: ExportColumn<T>;
  header: string;
}

/** Độ dài tối đa tiêu đề cột do client gửi */
export const MAX_HEADER_LENGTH = 100;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Chống chèn công thức (CSV / Excel injection): ô chữ bắt đầu bằng = + - @ (hoặc tab, xuống dòng) bị Excel hiểu là công thức,
 * thêm dấu ' phía trước để thành chữ thường. Chỉ áp cho chuỗi — số và ngày giữ nguyên kiểu.
 */
export function sanitizeCell(value: ExportCell): ExportCell {
  if (typeof value === "string" && FORMULA_PREFIX.test(value)) return `'${value}`;
  return value;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Excel lưu ngày giờ không kèm múi giờ và exceljs ghi theo UTC: dịch +7 giờ để ô hiện đúng giờ Việt Nam
 * (09:00 VN sẽ không thành 02:00). Giá trị không hợp lệ → null.
 */
export function toVnWallTime(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime() + VN_OFFSET_MS);
}

/**
 * Chọn cột theo yêu cầu của client: bỏ trùng, chỉ nhận khóa có trong `available` (khóa lạ → lỗi), nhãn cắt gọn và chống công thức.
 * Không gửi cột nào thì dùng toàn bộ cột theo thứ tự mặc định.
 */
export function resolveColumns<T>(
  available: ExportColumn<T>[],
  requested: RequestedColumn[] | undefined,
  lang: ExportLang,
): ResolvedColumn<T>[] {
  const byKey = new Map(available.map((column) => [column.key, column]));
  const wanted: RequestedColumn[] = requested?.length ? requested : available.map((column) => ({ key: column.key }));
  const seen = new Set<string>();
  const result: ResolvedColumn<T>[] = [];
  for (const item of wanted) {
    if (seen.has(item.key)) continue;
    const column = byKey.get(item.key);
    if (!column) throw new Error(`Unknown export column: ${item.key}`);
    seen.add(item.key);
    const custom = item.header?.trim().slice(0, MAX_HEADER_LENGTH);
    result.push({ column, header: String(sanitizeCell(custom || column.header[lang])) });
  }
  return result;
}

/** Một lô dòng + khóa của dòng cuối để lấy lô kế tiếp */
export interface KeysetBatch<T> {
  rows: T[];
  lastId: string;
}

/**
 * Duyệt toàn bộ dữ liệu theo từng lô, dùng khóa `id` (UUID v7: duy nhất, ổn định, không phụ thuộc độ chính xác của thời gian).
 * `fetch(afterId, limit)` trả các dòng có id lớn hơn `afterId` theo thứ tự id tăng dần; lô ngắn hơn `limit` là lô cuối.
 */
export async function* iterateKeyset<T extends { id: string }>(
  fetch: (afterId: string | null, limit: number) => Promise<T[]>,
  batchSize: number,
  signal?: AbortSignal,
): AsyncGenerator<T[]> {
  let afterId: string | null = null;
  for (;;) {
    signal?.throwIfAborted();
    const rows = await fetch(afterId, batchSize);
    if (!rows.length) return;
    yield rows;
    if (rows.length < batchSize) return;
    afterId = rows[rows.length - 1].id;
  }
}

/** Tên file tải về: chỉ chữ / số / gạch (giữ chữ có dấu), kèm ngày theo giờ Việt Nam (yyyyMMdd-HHmm); `ext`: zip khi nhiều phần */
export function exportFilename(base: string, now: Date = new Date(), ext: "xlsx" | "zip" = "xlsx"): string {
  const wall = toVnWallTime(now) ?? now;
  const stamp = wall.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  return `${base.replace(/[^\p{L}\p{N}_-]+/gu, "-")}-${stamp}.${ext}`;
}

/** Giá trị Content-Disposition có cả tên ASCII dự phòng và tên UTF-8 (tên có dấu tiếng Việt) */
export function contentDisposition(filename: string): string {
  const ascii = filename
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .replace(/[^\w.-]+/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Chia luồng các lô dòng thành nhiều "phần", mỗi phần tối đa `partSize` dòng (mỗi phần thành một file xlsx).
 * Các phần dùng chung một nguồn nên phải đọc hết phần hiện tại rồi mới sang phần kế. Không có dòng nào thì không có phần nào.
 */
export async function* splitParts<T>(batches: AsyncIterable<T[]>, partSize: number): AsyncGenerator<AsyncGenerator<T[]>> {
  const iterator = batches[Symbol.asyncIterator]();
  let carry: T[] = [];
  let done = false;
  const fill = async () => {
    while (!carry.length && !done) {
      const next = await iterator.next();
      if (next.done) done = true;
      else carry = next.value;
    }
  };

  for (;;) {
    await fill();
    if (!carry.length) return;
    yield (async function* part() {
      let left = partSize;
      while (left > 0) {
        await fill();
        if (!carry.length) return;
        const taken = carry.slice(0, left);
        carry = carry.slice(left);
        left -= taken.length;
        yield taken;
      }
    })();
  }
}

/** Nhãn ba ngôn ngữ (vi, en, zh) cho tiêu đề cột / tên file */
export const exportLabel = (vi: string, en: string, zh: string): Record<ExportLang, string> => ({ "vi-VN": vi, "en-US": en, "zh-CN": zh });
