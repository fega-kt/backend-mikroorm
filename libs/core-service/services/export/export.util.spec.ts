import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  type ExportColumn,
  exportFilename,
  iterateKeyset,
  resolveColumns,
  splitParts,
  sanitizeCell,
  toVnWallTime,
} from "./export.util";

describe("sanitizeCell", () => {
  it("prefixes strings that Excel would read as formulas", () => {
    for (const value of ["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"]) {
      expect(sanitizeCell(value)).toBe(`'${value}`);
    }
  });

  it("leaves ordinary text, numbers, dates and empty values alone", () => {
    const date = new Date("2026-11-05T10:00:00Z");
    expect(sanitizeCell("Mua máy tính")).toBe("Mua máy tính");
    expect(sanitizeCell("a=b")).toBe("a=b");
    expect(sanitizeCell(-5)).toBe(-5);
    expect(sanitizeCell(date)).toBe(date);
    expect(sanitizeCell(null)).toBeNull();
    expect(sanitizeCell(undefined)).toBeUndefined();
  });
});

describe("toVnWallTime", () => {
  it("shifts by +7 hours so Excel shows Vietnam time", () => {
    // 02:00 UTC = 09:00 giờ Việt Nam
    expect(toVnWallTime(new Date("2026-11-05T02:00:00Z"))?.toISOString()).toBe("2026-11-05T09:00:00.000Z");
  });

  it("rolls over midnight and accepts ISO strings", () => {
    expect(toVnWallTime("2026-11-05T20:30:00Z")?.toISOString()).toBe("2026-11-06T03:30:00.000Z");
  });

  it("returns null for missing or invalid values", () => {
    expect(toVnWallTime(null)).toBeNull();
    expect(toVnWallTime(undefined)).toBeNull();
    expect(toVnWallTime("không phải ngày")).toBeNull();
  });
});

describe("resolveColumns", () => {
  const available: ExportColumn<{ a: string }>[] = [
    { key: "code", header: { "vi-VN": "Mã", "en-US": "Code", "zh-CN": "编号" }, value: (row) => row.a },
    { key: "title", header: { "vi-VN": "Tiêu đề", "en-US": "Title", "zh-CN": "标题" }, value: (row) => row.a },
    { key: "status", header: { "vi-VN": "Trạng thái", "en-US": "Status", "zh-CN": "状态" }, value: (row) => row.a },
  ];

  it("uses every column with the default headers when none are requested", () => {
    expect(resolveColumns(available, undefined, "en-US").map((c) => [c.column.key, c.header])).toEqual([
      ["code", "Code"],
      ["title", "Title"],
      ["status", "Status"],
    ]);
  });

  it("keeps the requested order, drops duplicates and uses the custom header", () => {
    const resolved = resolveColumns(
      available,
      [{ key: "status", header: "  Tình trạng  " }, { key: "code" }, { key: "status", header: "lặp" }],
      "vi-VN",
    );
    expect(resolved.map((c) => [c.column.key, c.header])).toEqual([
      ["status", "Tình trạng"],
      ["code", "Mã"],
    ]);
  });

  it("rejects keys outside the allow-list", () => {
    expect(() => resolveColumns(available, [{ key: "password" }], "vi-VN")).toThrow(/Unknown export column/);
  });

  it("trims long headers and neutralises formulas in them", () => {
    const [resolved] = resolveColumns(available, [{ key: "code", header: `=HYPERLINK("x")${"a".repeat(200)}` }], "vi-VN");
    expect(resolved.header.startsWith("'=HYPERLINK")).toBe(true);
    expect(resolved.header.length).toBeLessThanOrEqual(101);
  });
});

describe("iterateKeyset", () => {
  /** Nguồn giả: 2.500 dòng id tăng dần, lọc theo afterId như câu truy vấn thật */
  const makeSource = (count: number) => {
    const all = Array.from({ length: count }, (_, i) => ({ id: String(i + 1).padStart(6, "0") }));
    const calls: (string | null)[] = [];
    const fetch = async (afterId: string | null, limit: number) => {
      calls.push(afterId);
      return all.filter((row) => afterId === null || row.id > afterId).slice(0, limit);
    };
    return { all, calls, fetch };
  };

  it("walks every row once, in order, in batches", async () => {
    const { all, calls, fetch } = makeSource(2500);
    const seen: string[] = [];
    for await (const rows of iterateKeyset(fetch, 1000)) seen.push(...rows.map((r) => r.id));
    expect(seen).toEqual(all.map((r) => r.id));
    // 3 lô (1000, 1000, 500) — lô ngắn là lô cuối nên không hỏi thêm
    expect(calls).toEqual([null, "001000", "002000"]);
  });

  it("asks once more when the last batch is exactly full, then stops on the empty batch", async () => {
    const { calls, fetch } = makeSource(2000);
    let total = 0;
    for await (const rows of iterateKeyset(fetch, 1000)) total += rows.length;
    expect(total).toBe(2000);
    expect(calls).toEqual([null, "001000", "002000"]);
  });

  it("yields nothing for an empty source", async () => {
    const { fetch } = makeSource(0);
    const batches: unknown[] = [];
    for await (const rows of iterateKeyset(fetch, 1000)) batches.push(rows);
    expect(batches).toEqual([]);
  });

  it("stops when the signal is aborted", async () => {
    const { fetch } = makeSource(5000);
    const controller = new AbortController();
    const seen: number[] = [];
    await expect(
      (async () => {
        for await (const rows of iterateKeyset(fetch, 1000, controller.signal)) {
          seen.push(rows.length);
          controller.abort();
        }
      })(),
    ).rejects.toThrow();
    expect(seen).toEqual([1000]);
  });
});

describe("filenames", () => {
  it("builds a safe name with the Vietnam date and time", () => {
    // 20:30 UTC ngày 5 = 03:30 ngày 6 giờ Việt Nam
    expect(exportFilename("tờ trình / của tôi", new Date("2026-11-05T20:30:00Z"))).toBe("tờ-trình-của-tôi-20261106-0330.xlsx");
  });

  it("keeps an ASCII fallback and a UTF-8 name in Content-Disposition", () => {
    const header = contentDisposition("Tờ trình đã duyệt.xlsx");
    expect(header).toContain('filename="To_trinh_da_duyet.xlsx"');
    expect(header).toContain("filename*=UTF-8''T%E1%BB%9D%20tr%C3%ACnh");
  });
});

describe("splitParts", () => {
  async function* source(...sizes: number[]) {
    let n = 0;
    for (const size of sizes) yield Array.from({ length: size }, () => ++n);
  }

  /** Đọc hết từng phần, trả về số dòng + dòng đầu / cuối của mỗi phần */
  async function summarize(batches: AsyncIterable<number[]>, partSize: number) {
    const parts: { count: number; first: number; last: number }[] = [];
    for await (const part of splitParts(batches, partSize)) {
      const rows: number[] = [];
      for await (const batch of part) rows.push(...batch);
      parts.push({ count: rows.length, first: rows[0], last: rows[rows.length - 1] });
    }
    return parts;
  }

  it("keeps everything in one part when it fits", async () => {
    expect(await summarize(source(3, 4), 10)).toEqual([{ count: 7, first: 1, last: 7 }]);
  });

  it("cuts parts in the middle of a batch and never loses or repeats a row", async () => {
    expect(await summarize(source(4, 4, 4), 5)).toEqual([
      { count: 5, first: 1, last: 5 },
      { count: 5, first: 6, last: 10 },
      { count: 2, first: 11, last: 12 },
    ]);
  });

  it("does not open an empty extra part when the rows end exactly on a boundary", async () => {
    expect(await summarize(source(5, 5), 5)).toEqual([
      { count: 5, first: 1, last: 5 },
      { count: 5, first: 6, last: 10 },
    ]);
  });

  it("yields no part for an empty source and skips empty batches", async () => {
    expect(await summarize(source(), 5)).toEqual([]);
    expect(await summarize(source(0, 2, 0, 1), 5)).toEqual([{ count: 3, first: 1, last: 3 }]);
  });
});
