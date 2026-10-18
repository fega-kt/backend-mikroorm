import { ENV } from "@config/env.config";
import { UploadService } from "../upload/upload.service";
import { Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";

/** Tệp văn phòng lớn (nhiều trang / nhiều sheet) có thể chuyển khá lâu */
const CONVERT_TIMEOUT_MS = 120_000;

/** Đuôi tệp service FileConverter chuyển được sang PDF (kiểm magic bytes theo đúng đuôi) */
const CONVERTIBLE_EXTENSIONS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

const extOf = (filename: string) => (filename.includes(".") ? (filename.split(".").pop() ?? "").toLowerCase() : "");

/** Word / Excel / PowerPoint → chuyển sang PDF được */
export const isConvertibleToPdf = (filename: string) => CONVERTIBLE_EXTENSIONS.includes(extOf(filename));

export const isPdf = (filename: string) => extOf(filename) === "pdf";

/** Tên PDF sau chuyển đổi: giữ tên gốc, đổi đuôi */
export const pdfFilenameOf = (filename: string) => `${filename.replace(/\.[^.]+$/, "")}.pdf`;

/**
 * Chuyển văn bản sang PDF bằng service FileConverter (repo netcore, Syncfusion) — không phụ thuộc OnlyOffice.
 * Backend đọc tệp từ R2 rồi gửi thẳng nội dung sang service, nhận lại PDF.
 */
@Injectable()
export class OfficeConverter {
  private readonly logger = new Logger(OfficeConverter.name);

  constructor(private readonly uploadService: UploadService) {}

  async toPdf(file: { id: string; key: string; filename: string }): Promise<Buffer> {
    if (!ENV.FILE_CONVERTER_URL) throw new ServiceUnavailableException("File converter is not configured");

    const form = new FormData();
    const content = await this.uploadService.getObjectBuffer(file.key);
    form.append("file", new Blob([content]), file.filename);

    let res: Response;
    try {
      res = await fetch(`${ENV.FILE_CONVERTER_URL.replace(/\/+$/, "")}/api/convert/file`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(CONVERT_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`File converter unreachable for ${file.id}`, error);
      throw new ServiceUnavailableException("File converter is unavailable");
    }
    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as { error?: string };
      this.logger.warn(`Converting ${file.id} to PDF failed (${res.status}): ${problem.error ?? ""}`);
      throw new UnprocessableEntityException({ code: "CONVERT_FAILED", message: `Cannot convert "${file.filename}" to PDF` });
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
