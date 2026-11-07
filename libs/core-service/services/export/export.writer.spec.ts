import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { type ExportColumn, resolveColumns } from "./export.util";
import { safeSheetName, writeWorkbook } from "./export.writer";

interface Row {
  id: string;
  title: string;
  amount: number | null;
  at: Date | null;
}

const columns: ExportColumn<Row>[] = [
  { key: "title", header: { "vi-VN": "Tiêu đề", "en-US": "Title", "zh-CN": "标题" }, value: (row) => row.title },
  { key: "amount", header: { "vi-VN": "Số tiền", "en-US": "Amount", "zh-CN": "金额" }, type: "number", value: (row) => row.amount },
  { key: "at", header: { "vi-VN": "Ngày", "en-US": "Date", "zh-CN": "日期" }, type: "datetime", value: (row) => row.at },
];

async function* batchesOf(...groups: Row[][]) {
  for (const group of groups) yield group;
}

async function render(groups: Row[][], requested?: { key: string; header?: string }[]) {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve) => out.on("end", resolve));
  const count = await writeWorkbook({
    out,
    sheetName: "Tờ trình / [của tôi]",
    columns: resolveColumns(columns, requested, "vi-VN"),
    lang: "vi-VN",
    batches: batchesOf(...groups),
  });
  await finished;
  const workbook = new ExcelJS.Workbook();
  // Kiểu Buffer của exceljs là bản cũ, không khớp Buffer<ArrayBuffer> của Node mới
  await workbook.xlsx.load(Buffer.concat(chunks) as unknown as ExcelJS.Buffer);
  return { count, sheet: workbook.worksheets[0] };
}

describe("writeWorkbook", () => {
  it("writes the header, typed cells and a frozen first row across batches", async () => {
    const { count, sheet } = await render([
      [{ id: "1", title: "Mua máy", amount: 1500000, at: new Date("2026-11-05T02:00:00Z") }],
      [{ id: "2", title: "Nghỉ phép", amount: null, at: null }],
    ]);
    expect(count).toBe(2);
    expect(sheet.name).toBe("Tờ trình    của tôi");
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(1).values).toEqual([undefined, "Tiêu đề", "Số tiền", "Ngày"]);
    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });

    const first = sheet.getRow(2);
    expect(first.getCell(1).value).toBe("Mua máy");
    expect(first.getCell(2).value).toBe(1500000);
    // 02:00 UTC = 09:00 giờ Việt Nam: ô phải hiện 09:00, không phải 02:00
    expect((first.getCell(3).value as Date).toISOString()).toBe("2026-11-05T09:00:00.000Z");
    expect(first.getCell(3).numFmt).toBe("dd/mm/yyyy hh:mm");

    const second = sheet.getRow(3);
    expect(second.getCell(2).value).toBeNull();
    expect(second.getCell(3).value).toBeNull();
  });

  it("neutralises formulas in text cells but keeps numbers", async () => {
    const { sheet } = await render([[{ id: "1", title: '=HYPERLINK("http://x")', amount: -5, at: null }]]);
    expect(sheet.getRow(2).getCell(1).value).toBe('\'=HYPERLINK("http://x")');
    expect(sheet.getRow(2).getCell(2).value).toBe(-5);
  });

  it("writes only the requested columns, in the requested order and headers", async () => {
    const { sheet } = await render([[{ id: "1", title: "A", amount: 7, at: null }]], [{ key: "amount", header: "Tổng" }, { key: "title" }]);
    expect(sheet.getRow(1).values).toEqual([undefined, "Tổng", "Tiêu đề"]);
    expect(sheet.getRow(2).values).toEqual([undefined, 7, "A"]);
  });

  it("writes a header-only file for no rows", async () => {
    const { count, sheet } = await render([]);
    expect(count).toBe(0);
    expect(sheet.rowCount).toBe(1);
  });
});

describe("safeSheetName", () => {
  it("removes forbidden characters and limits the length to 31", () => {
    expect(safeSheetName("a:b\\c/d?e*f[g]h")).toBe("a b c d e f g h");
    expect(safeSheetName("x".repeat(60))).toHaveLength(31);
    expect(safeSheetName("   ")).toBe("Sheet1");
  });
});
