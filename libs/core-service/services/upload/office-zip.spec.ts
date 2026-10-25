import archiver from "archiver";
import { describe, expect, it } from "vitest";
import { checkOfficeZip } from "./office-zip";

/** ZIP thật (qua archiver) chứa các mục có tên cho trước */
async function zipOf(names: string[], options: { comment?: string; forceZip64?: boolean } = {}) {
  const archive = archiver("zip", { comment: options.comment, forceZip64: options.forceZip64 });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise((resolve) => archive.on("end", resolve));
  for (const name of names) archive.append(`<${name}/>`, { name });
  await archive.finalize();
  await ended;
  return Buffer.concat(chunks);
}

const check = (ext: string, file: Buffer) => checkOfficeZip(ext, file.length, async (start, end) => file.subarray(start, end));

const DOCX_PARTS = ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"];

describe("checkOfficeZip (mục lục ZIP của docx / xlsx / pptx)", () => {
  it("docx đủ thành phần: ok", async () => {
    expect(await check(".docx", await zipOf(DOCX_PARTS))).toBe("ok");
  });

  it("có chú thích ZIP sau EOCD vẫn đọc được", async () => {
    expect(await check(".docx", await zipOf(DOCX_PARTS, { comment: "x".repeat(500) }))).toBe("ok");
  });

  it("file ZIP thường đổi đuôi .docx: invalid", async () => {
    expect(await check(".docx", await zipOf(["anh.png", "bao-cao.pdf"]))).toBe("invalid");
  });

  it("xlsx đổi đuôi .docx: invalid; đúng đuôi .xlsx: ok", async () => {
    const xlsx = await zipOf(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    expect(await check(".docx", xlsx)).toBe("invalid");
    expect(await check(".xlsx", xlsx)).toBe("ok");
  });

  it("docx bị cắt cụt (mất phần cuối): invalid", async () => {
    const docx = await zipOf(DOCX_PARTS);
    expect(await check(".docx", docx.subarray(0, docx.length - 30))).toBe("invalid");
  });

  it("file không phải ZIP: invalid", async () => {
    expect(await check(".docx", Buffer.from("examplefile.com - Sample Files\n".repeat(100)))).toBe("invalid");
  });

  it("ZIP64: không kiểm được, cho qua", async () => {
    expect(await check(".docx", await zipOf(["a.txt"], { forceZip64: true }))).toBe("unknown");
  });

  it("đuôi không phải Office mới: không kiểm", async () => {
    expect(await check(".pdf", Buffer.from("%PDF-1.7"))).toBe("ok");
  });
});
