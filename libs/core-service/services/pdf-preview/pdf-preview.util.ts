import { EncryptedPDFError, PDFDict, PDFDocument, PDFName } from "pdf-lib";

/** Kích thước một lần tải (Range) của trình xem PDF ở client — khớp rangeChunkSize của pdf.js */
export const PDF_RANGE_CHUNK_BYTES = 256 * 1024;

/**
 * Object của các trang nằm rải trên nhiều hơn chừng này đoạn thì nên sắp xếp lại:
 * lúc mở file pdf.js đi hết cây trang (kiểm tra trang cuối), mỗi đoạn chứa object trang là một lần tải.
 */
export const MAX_PAGE_CHUNKS = 4;

export enum PdfPreviewSkipReason {
  /** Có mật khẩu / mã hóa: không đọc lại được */
  Encrypted = "encrypted",
  /** Có chữ ký số: ghi lại sẽ làm chữ ký mất hiệu lực (dù chỉ là bản xem, không đụng vào tệp đã ký) */
  Signed = "signed",
  /** Object trang đã gọn (vd PDF xuất từ Word): xem bản gốc vẫn nhanh, không tốn thêm dung lượng */
  Compact = "compact",
}

export interface PdfInspection {
  encrypted: boolean;
  signed: boolean;
  /** Số đoạn PDF_RANGE_CHUNK_BYTES có chứa object trang (không nén) */
  pageChunks: number;
}

/** PDF có chữ ký số / mã hóa (nằm trong object stream nén) chỉ phát hiện được sau khi đọc bằng pdf-lib */
export class PdfProtectedError extends Error {
  constructor(readonly reason: PdfPreviewSkipReason.Encrypted | PdfPreviewSkipReason.Signed) {
    super(`PDF is ${reason}`);
  }
}

/**
 * Đọc nhanh cấu trúc PDF từ byte thô (không dựng lại tài liệu):
 * mã hóa (/Encrypt), chữ ký số (/ByteRange, trường /Sig, /DocMDP) và độ rải của object trang trong file.
 */
export function inspectPdfBytes(bytes: Buffer): PdfInspection {
  const text = bytes.toString("latin1");
  const encrypted = /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(text);
  const signed = /\/ByteRange\s*\[/.test(text) || /\/(?:FT|Type)\s*\/Sig\b/.test(text) || /\/DocMDP\b/.test(text);
  const chunks = new Set<number>();
  for (const match of text.matchAll(/\/Type\s*\/Page(?![A-Za-z])/g)) chunks.add(Math.floor(match.index / PDF_RANGE_CHUNK_BYTES));
  return { encrypted, signed, pageChunks: chunks.size };
}

/** Lý do không tạo bản xem: tệp bảo mật / ký số thì không được, tệp đã gọn thì không cần. undefined = nên tạo */
export function previewSkipReason(inspection: PdfInspection): PdfPreviewSkipReason | undefined {
  if (inspection.encrypted) return PdfPreviewSkipReason.Encrypted;
  if (inspection.signed) return PdfPreviewSkipReason.Signed;
  if (inspection.pageChunks <= MAX_PAGE_CHUNKS) return PdfPreviewSkipReason.Compact;
  return undefined;
}

const SIG = PDFName.of("Sig");

function hasSignature(doc: PDFDocument) {
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    if (object.has(PDFName.of("ByteRange")) || object.get(PDFName.of("FT")) === SIG || object.get(PDFName.of("Type")) === SIG) return true;
  }
  return false;
}

/**
 * Ghi lại PDF với object stream: object nhỏ (trang, tài nguyên…) được gom vào vài khối nén cạnh nhau,
 * ảnh và nội dung giữ nguyên từng byte. Trình xem nhờ đó chỉ cần vài đoạn đầu để mở file thay vì đọc rải khắp file.
 * Kiểm lại số trang sau khi ghi; tệp mã hóa / ký số ném PdfProtectedError.
 */
export async function optimizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof EncryptedPDFError) throw new PdfProtectedError(PdfPreviewSkipReason.Encrypted);
    throw error;
  }
  if (hasSignature(doc)) throw new PdfProtectedError(PdfPreviewSkipReason.Signed);

  const pageCount = doc.getPageCount();
  const output = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  const check = await PDFDocument.load(output, { updateMetadata: false });
  if (check.getPageCount() !== pageCount) {
    throw new Error(`Page count changed after rewrite (${pageCount} → ${check.getPageCount()})`);
  }
  return output;
}
