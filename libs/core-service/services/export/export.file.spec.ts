import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeExportFile } from "./export.file";
import type { ExportDefinition, ExportRequestSnapshot } from "./export.types";

interface Row {
  id: string;
  name: string;
}

/** Định nghĩa giả: `count` dòng id tăng dần, đọc theo khóa như câu truy vấn thật */
function fakeDefinition(count: number): ExportDefinition<never> {
  const all: Row[] = Array.from({ length: count }, (_, i) => ({ id: String(i + 1).padStart(6, "0"), name: `Dòng ${i + 1}` }));
  const definition: ExportDefinition<Row> = {
    resource: "fake",
    permissions: [],
    filterSchema: { parse: (value: unknown) => value } as never,
    columns: [
      { key: "id", header: { "vi-VN": "Mã", "en-US": "Id", "zh-CN": "编号" }, value: (row) => row.id },
      { key: "name", header: { "vi-VN": "Tên", "en-US": "Name", "zh-CN": "名称" }, value: (row) => row.name },
    ],
    title: { "vi-VN": "Thử nghiệm", "en-US": "Test", "zh-CN": "测试" },
    open: async () => ({
      count: async () => count,
      fetch: async (afterId, limit) => all.filter((row) => !afterId || row.id > afterId).slice(0, limit),
    }),
  };
  return definition as unknown as ExportDefinition<never>;
}

const snapshot = (total: number, filename: string): ExportRequestSnapshot => ({
  resource: "fake",
  userId: "u1",
  filter: {},
  columns: undefined,
  lang: "vi-VN",
  cutoff: new Date().toISOString(),
  filename,
  total,
});

/** Đọc danh sách file trong zip (dạng store) qua central directory: archiver ghi kích thước ở data descriptor nên không đọc được từ local header */
function readStoredZip(buffer: Buffer): Map<string, Buffer> {
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    entries.set(name, buffer.subarray(dataStart, dataStart + size));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const loadSheet = async (data: Buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);
  return workbook.worksheets[0];
};

describe("writeExportFile", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "export-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes a single xlsx when the rows fit one part", async () => {
    const progress: number[] = [];
    const result = await writeExportFile({
      definition: fakeDefinition(7),
      snapshot: snapshot(7, "thu-nghiem.xlsx"),
      em: {} as never,
      dir,
      partRows: 10,
      onProgress: (rows) => void progress.push(rows),
    });
    expect(result).toMatchObject({ parts: 1, rows: 7, mimetype: expect.stringContaining("spreadsheetml") });
    expect(result.size).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(7);
    const sheet = await loadSheet(await readFile(result.path));
    expect(sheet.rowCount).toBe(8);
    expect(sheet.getRow(8).getCell(2).value).toBe("Dòng 7");
  });

  it("splits into several xlsx files inside one zip when there are too many rows", async () => {
    const result = await writeExportFile({
      definition: fakeDefinition(12),
      snapshot: snapshot(12, "thu-nghiem.zip"),
      em: {} as never,
      dir,
      partRows: 5,
    });
    expect(result).toMatchObject({ parts: 3, rows: 12, mimetype: "application/zip" });

    const entries = readStoredZip(await readFile(result.path));
    expect([...entries.keys()]).toEqual(["thu-nghiem-001.xlsx", "thu-nghiem-002.xlsx", "thu-nghiem-003.xlsx"]);
    const sheets = await Promise.all([...entries.values()].map(loadSheet));
    // Mỗi file có header + phần của nó; hợp lại đủ 12 dòng, không trùng không sót
    expect(sheets.map((sheet) => sheet.rowCount - 1)).toEqual([5, 5, 2]);
    expect(sheets.map((sheet) => sheet.getRow(2).getCell(2).value)).toEqual(["Dòng 1", "Dòng 6", "Dòng 11"]);
    expect(sheets[2].getRow(3).getCell(2).value).toBe("Dòng 12");
    expect(sheets.every((sheet) => sheet.getRow(1).getCell(1).value === "Mã")).toBe(true);
  });

  it("stops when the progress hook throws (cancel / timeout)", async () => {
    await expect(
      writeExportFile({
        definition: fakeDefinition(3000),
        snapshot: snapshot(3000, "x.xlsx"),
        em: {} as never,
        dir,
        onProgress: () => {
          throw new Error("cancelled");
        },
      }),
    ).rejects.toThrow("cancelled");
  });
});
