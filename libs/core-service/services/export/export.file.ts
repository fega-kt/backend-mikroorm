import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { PassThrough, type Writable } from "node:stream";
import { finished } from "node:stream/promises";
import type { EntityManager } from "@mikro-orm/core";
import archiver from "archiver";
import { EXPORT_BATCH_SIZE, EXPORT_MIME_XLSX, EXPORT_MIME_ZIP, EXPORT_PART_ROWS } from "./export.constants";
import type { ExportDefinition, ExportRequestSnapshot } from "./export.types";
import { iterateKeyset, resolveColumns, splitParts } from "./export.util";
import { writeWorkbook } from "./export.writer";

/**
 * Luồng các lô dòng của một lượt xuất, đọc theo khóa id. `definition.open` nhận `em` và tham số thuần nên chạy được cả trong
 * request lẫn ở worker. Ép kiểu một lần ở đây: định nghĩa trong sổ đăng ký đã bị xóa kiểu dòng (`never`).
 */
export async function openExportRows(
  definition: ExportDefinition<never>,
  snapshot: ExportRequestSnapshot,
  em: EntityManager,
  signal?: AbortSignal,
): Promise<AsyncIterable<never[]>> {
  const scope = await definition.open(em, snapshot.filter, snapshot.userId, new Date(snapshot.cutoff), snapshot.scope);
  const fetch = scope.fetch as (afterId: string | null, limit: number) => Promise<{ id: string }[]>;
  return iterateKeyset(fetch, EXPORT_BATCH_SIZE, signal) as unknown as AsyncIterable<never[]>;
}

/** Ghi một file xlsx của lượt xuất vào `out` (response HTTP hoặc file); trả về số dòng đã ghi */
export async function writeExportXlsx(
  definition: ExportDefinition<never>,
  snapshot: ExportRequestSnapshot,
  em: EntityManager,
  out: Writable,
  signal?: AbortSignal,
): Promise<number> {
  return writeWorkbook({
    out,
    sheetName: definition.title[snapshot.lang],
    columns: resolveColumns(definition.columns, snapshot.columns, snapshot.lang),
    lang: snapshot.lang,
    batches: await openExportRows(definition, snapshot, em, signal),
    signal,
  });
}

export interface ExportFileResult {
  /** Đường dẫn file tạm vừa ghi */
  path: string;
  size: number;
  /** Số file xlsx bên trong (> 1: kết quả là zip) */
  parts: number;
  rows: number;
  mimetype: string;
}

export interface WriteExportFileOptions {
  definition: ExportDefinition<never>;
  snapshot: ExportRequestSnapshot;
  em: EntityManager;
  /** Thư mục tạm đã tạo sẵn; file kết quả nằm trong đó */
  dir: string;
  signal?: AbortSignal;
  /** Gọi sau mỗi lô với tổng số dòng đã ghi — nơi cập nhật tiến độ, kiểm hủy / quá hạn (ném lỗi để dừng) */
  onProgress?: (rows: number) => Promise<void> | void;
  /** Số dòng tối đa mỗi file xlsx (mặc định EXPORT_PART_ROWS; test đặt nhỏ) */
  partRows?: number;
}

/**
 * Ghi kết quả ra file tạm: một xlsx nếu vừa một phần, ngược lại zip chứa nhiều xlsx (mỗi file tối đa `partRows` dòng,
 * đặt tên `<tên>-001.xlsx`…). Ghi theo luồng nên bộ nhớ chỉ bằng một lô; dung lượng đĩa bằng dung lượng file kết quả.
 */
export async function writeExportFile({
  definition,
  snapshot,
  em,
  dir,
  signal,
  onProgress,
  partRows = EXPORT_PART_ROWS,
}: WriteExportFileOptions): Promise<ExportFileResult> {
  const columns = resolveColumns(definition.columns, snapshot.columns, snapshot.lang);
  const sheetName = definition.title[snapshot.lang];
  let rows = 0;
  const counted = async function* (source: AsyncIterable<never[]>): AsyncGenerator<never[]> {
    for await (const batch of source) {
      yield batch;
      rows += batch.length;
      await onProgress?.(rows);
    }
  };
  const batches = counted(await openExportRows(definition, snapshot, em, signal));

  if (snapshot.total <= partRows) {
    const file = path.join(dir, "export.xlsx");
    const out = createWriteStream(file);
    await writeWorkbook({ out, sheetName, columns, lang: snapshot.lang, batches, signal });
    await finished(out);
    return { path: file, size: (await stat(file)).size, parts: 1, rows, mimetype: EXPORT_MIME_XLSX };
  }

  const file = path.join(dir, "export.zip");
  const out = createWriteStream(file);
  // Không nén: xlsx đã là zip, nén lại tốn CPU mà gần như không nhỏ hơn
  const archive = archiver("zip", { store: true });
  archive.pipe(out);
  const archiveFailed = new Promise<never>((_, reject) => archive.on("error", reject));
  const base = path.basename(snapshot.filename, path.extname(snapshot.filename));
  let parts = 0;
  const build = async () => {
    for await (const part of splitParts(batches, partRows)) {
      parts++;
      const pass = new PassThrough();
      const entryDone = once(archive, "entry");
      archive.append(pass, { name: `${base}-${String(parts).padStart(3, "0")}.xlsx` });
      await Promise.all([writeWorkbook({ out: pass, sheetName, columns, lang: snapshot.lang, batches: part, signal }), entryDone]);
    }
    await archive.finalize();
    await finished(out);
  };
  await Promise.race([build(), archiveFailed]);
  return { path: file, size: (await stat(file)).size, parts, rows, mimetype: EXPORT_MIME_ZIP };
}
