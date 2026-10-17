import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  inspectPdfBytes,
  MAX_PAGE_CHUNKS,
  optimizePdf,
  PDF_RANGE_CHUNK_BYTES,
  PdfPreviewSkipReason,
  PdfProtectedError,
  previewSkipReason,
} from "./pdf-preview.util";

/** PDF giả lập bản scan: mỗi trang kèm một khối dữ liệu lớn (như ảnh), object trang rải khắp file */
async function scannedPdf(pages: number, bytesPerPage = PDF_RANGE_CHUNK_BYTES) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    const blob = doc.context.flateStream(new Uint8Array(bytesPerPage).map(() => Math.floor(Math.random() * 256)));
    page.node.set(PDFName.of("PieceInfo"), doc.context.register(blob));
  }
  // Không dùng object stream: object trang nằm xen giữa các khối dữ liệu như file scan thật
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe("inspectPdfBytes / previewSkipReason", () => {
  it("phát hiện tệp mã hóa", () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\ntrailer << /Root 2 0 R /Encrypt 5 0 R >>\n%%EOF");
    const inspection = inspectPdfBytes(bytes);
    expect(inspection.encrypted).toBe(true);
    expect(previewSkipReason(inspection)).toBe(PdfPreviewSkipReason.Encrypted);
  });

  it("phát hiện chữ ký số qua /ByteRange hoặc trường /Sig", () => {
    expect(inspectPdfBytes(Buffer.from("<< /Type /Sig /ByteRange [0 10 20 30] >>")).signed).toBe(true);
    expect(inspectPdfBytes(Buffer.from("<< /FT /Sig /T (Signature1) >>")).signed).toBe(true);
    expect(inspectPdfBytes(Buffer.from("<< /SigFlags 3 >>")).signed).toBe(false);
  });

  it("tệp nhỏ / gọn thì không cần tạo bản xem", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 20; i++) doc.addPage();
    const inspection = inspectPdfBytes(Buffer.from(await doc.save()));
    expect(inspection.pageChunks).toBeLessThanOrEqual(MAX_PAGE_CHUNKS);
    expect(previewSkipReason(inspection)).toBe(PdfPreviewSkipReason.Compact);
  });

  it("bản scan có object trang rải khắp file thì cần tạo bản xem", async () => {
    const inspection = inspectPdfBytes(await scannedPdf(8));
    expect(inspection.pageChunks).toBeGreaterThan(MAX_PAGE_CHUNKS);
    expect(previewSkipReason(inspection)).toBeUndefined();
  });
});

describe("optimizePdf", () => {
  it("gom object trang lại một chỗ và giữ nguyên số trang", async () => {
    const source = await scannedPdf(8);
    const output = Buffer.from(await optimizePdf(source));
    expect((await PDFDocument.load(output)).getPageCount()).toBe(8);
    // Object trang nằm trong object stream nén: không còn rải theo từng khối dữ liệu
    expect(inspectPdfBytes(output).pageChunks).toBeLessThanOrEqual(MAX_PAGE_CHUNKS);
  });

  it("từ chối tệp có chữ ký số nằm trong object stream (không thấy được bằng byte thô)", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.context.register(doc.context.obj({ FT: "Sig", V: PDFNumber.of(1) }));
    const compressed = Buffer.from(await doc.save({ useObjectStreams: true }));
    await expect(optimizePdf(compressed)).rejects.toBeInstanceOf(PdfProtectedError);
  });
});
