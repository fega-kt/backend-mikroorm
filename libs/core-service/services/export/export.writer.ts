import { once } from "node:events";
import type { Writable } from "node:stream";
import ExcelJS from "exceljs";
import { type ExportCell, type ExportLang, type ResolvedColumn, sanitizeCell, toVnWallTime } from "./export.util";

const DATE_FORMAT = "dd/mm/yyyy";
const DATETIME_FORMAT = "dd/mm/yyyy hh:mm";
const DEFAULT_WIDTH = 18;
/** Tên sheet Excel: tối đa 31 ký tự, không chứa : \ / ? * [ ] */
const SHEET_NAME_MAX = 31;

export const safeSheetName = (name: string) =>
  name
    .replace(/[:\\/?*[\]]/g, " ")
    .trim()
    .slice(0, SHEET_NAME_MAX) || "Sheet1";

/** Ô theo kiểu cột: ngày → giờ Việt Nam, chữ → chống công thức, số / trống giữ nguyên */
function toCellValue(type: "text" | "number" | "date" | "datetime" | undefined, value: ExportCell): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  if (type === "date" || type === "datetime") {
    const wall = value instanceof Date || typeof value === "string" ? toVnWallTime(value) : null;
    return wall;
  }
  if (type === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  return sanitizeCell(text);
}

export interface WriteWorkbookOptions<T> {
  /** Đích ghi (vd: response HTTP); exceljs đóng nó khi xong */
  out: Writable;
  sheetName: string;
  columns: ResolvedColumn<T>[];
  lang: ExportLang;
  /** Các lô dòng, theo thứ tự */
  batches: AsyncIterable<T[]>;
  signal?: AbortSignal;
}

/**
 * Ghi xlsx dạng stream: mỗi dòng được ghi và giải phóng ngay (`commit`), bộ nhớ chỉ bằng một lô dù có bao nhiêu dòng.
 * Đích ghi chậm (người tải mạng yếu) thì chờ `drain` giữa các lô để không dồn dữ liệu vào bộ nhớ. Trả về số dòng đã ghi.
 */
export async function writeWorkbook<T>({ out, sheetName, columns, lang, batches, signal }: WriteWorkbookOptions<T>): Promise<number> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useSharedStrings: false, useStyles: true });
  const sheet = workbook.addWorksheet(safeSheetName(sheetName), { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map(({ column, header }) => ({
    header,
    key: column.key,
    width: column.width ?? DEFAULT_WIDTH,
    style: column.type === "date" ? { numFmt: DATE_FORMAT } : column.type === "datetime" ? { numFmt: DATETIME_FORMAT } : undefined,
  }));
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();

  let count = 0;
  for await (const rows of batches) {
    for (const row of rows) {
      const values = columns.map(({ column }) => toCellValue(column.type, column.value(row, lang)));
      sheet.addRow(values).commit();
      count++;
    }
    if (out.writableNeedDrain) await once(out, "drain", { signal });
  }
  await sheet.commit();
  await workbook.commit();
  return count;
}
