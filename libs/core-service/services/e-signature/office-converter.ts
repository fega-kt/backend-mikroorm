import { describeError } from "@common/utils/describe-error.util";
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

    const url = `${ENV.FILE_CONVERTER_URL.replace(/\/+$/, "")}/api/convert/file`;
    const tag = `file=${file.id} name="${file.filename}" size=${content.length} url=${url}`;
    const startedAt = performance.now();
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(CONVERT_TIMEOUT_MS) });
    } catch (error) {
      // fetch chỉ báo "fetch failed": lỗi mạng thật (ECONNREFUSED, ENOTFOUND, ETIMEDOUT…) nằm trong cause
      const reason =
        error instanceof Error && error.name === "TimeoutError"
          ? `timeout after ${CONVERT_TIMEOUT_MS}ms`
          : describeError((error as { cause?: unknown }).cause ?? error);
      this.logger.error(`File converter unreachable ${tag} ms=${Math.round(performance.now() - startedAt)}: ${reason}`);
      throw new ServiceUnavailableException("File converter is unavailable");
    }
    const ms = Math.round(performance.now() - startedAt);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let detail = body.slice(0, 500);
      try {
        detail = (JSON.parse(body) as { error?: string }).error ?? detail;
      } catch {}
      this.logger.warn(`Converting to PDF failed ${tag} status=${res.status} ms=${ms}: ${detail}`);
      throw new UnprocessableEntityException({ code: "CONVERT_FAILED", message: `Cannot convert "${file.filename}" to PDF` });
    }
    const pdf = Buffer.from(await res.arrayBuffer());
    this.logger.log(`Converted to PDF ${tag} pdfSize=${pdf.length} ms=${ms}`);
    return pdf;
  }
}
