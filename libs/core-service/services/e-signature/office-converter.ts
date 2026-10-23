import { describeError } from "@common/utils/describe-error.util";
import { ENV } from "@config/env.config";
import { MAX_PRIVATE_UPLOAD_SIZE } from "../upload/upload.constants";
import { UploadService } from "../upload/upload.service";
import { Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { type IncomingMessage, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { Readable } from "stream";

/** Tệp lớn nhất chuyển được sang PDF — bằng trần upload và MAX_FILE_MB của service FileConverter */
export const MAX_CONVERT_SIZE = MAX_PRIVATE_UPLOAD_SIZE;

/** Thời gian chờ cả lượt (gửi tệp + chuyển + nhận PDF): 2 phút + 3 giây mỗi MB — tệp 200 MB ≈ 12 phút */
const convertTimeoutMs = (size: number) => 120_000 + Math.ceil(size / (1024 * 1024)) * 3_000;

/** Đuôi tệp service FileConverter chuyển được sang PDF (kiểm magic bytes theo đúng đuôi) */
const CONVERTIBLE_EXTENSIONS = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

const extOf = (filename: string) => (filename.includes(".") ? (filename.split(".").pop() ?? "").toLowerCase() : "");

/** Word / Excel / PowerPoint → chuyển sang PDF được */
export const isConvertibleToPdf = (filename: string) => CONVERTIBLE_EXTENSIONS.includes(extOf(filename));

export const isPdf = (filename: string) => extOf(filename) === "pdf";

/** Tên PDF sau chuyển đổi: giữ tên gốc, đổi đuôi */
export const pdfFilenameOf = (filename: string) => `${filename.replace(/\.[^.]+$/, "")}.pdf`;

const readText = async (res: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
};

const tooLarge = (filename: string) =>
  new UnprocessableEntityException({
    code: "FILE_TOO_LARGE",
    message: `"${filename}" is too large to convert to PDF (max ${MAX_CONVERT_SIZE / 1024 / 1024} MB)`,
  });

/**
 * Chuyển văn bản sang PDF bằng service FileConverter (repo netcore, Syncfusion) — không phụ thuộc OnlyOffice.
 * Tệp đi theo luồng R2 → FileConverter → R2: backend không giữ cả tệp gốc lẫn PDF trong RAM (tệp tới 200 MB).
 */
@Injectable()
export class OfficeConverter {
  private readonly logger = new Logger(OfficeConverter.name);

  constructor(private readonly uploadService: UploadService) {}

  /** Chuyển tệp sang PDF và ghi thẳng PDF vào bucket private tại targetKey; trả về dung lượng PDF */
  async toPdfObject(file: { id: string; key: string; filename: string }, targetKey: string): Promise<{ size: number }> {
    if (!ENV.FILE_CONVERTER_URL) throw new ServiceUnavailableException("File converter is not configured");

    const source = await this.uploadService.getObject(file.key);
    const size = source.contentLength ?? 0;
    // Quá trần: báo ngay, không tải tệp về rồi mới bị service từ chối
    if (size > MAX_CONVERT_SIZE) {
      source.body.destroy();
      throw tooLarge(file.filename);
    }

    // Multipart tự ghép quanh luồng tệp: biết trước tổng dung lượng nên gửi được Content-Length
    const boundary = `----zhizhu-${randomUUID()}`;
    const safeName = file.filename.replace(/["\r\n]/g, "_");
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Readable.from(
      (async function* () {
        yield head;
        yield* source.body;
        yield tail;
      })(),
    );

    const url = new URL(`${ENV.FILE_CONVERTER_URL.replace(/\/+$/, "")}/api/convert/file`);
    const tag = `file=${file.id} name="${file.filename}" size=${size} url=${url}`;
    const timeoutMs = convertTimeoutMs(size);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    const startedAt = performance.now();
    const elapsed = () => Math.round(performance.now() - startedAt);

    try {
      let res: IncomingMessage;
      try {
        res = await this.post(
          url,
          body,
          { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": `${head.length + size + tail.length}` },
          abort.signal,
        );
      } catch (error) {
        const reason = abort.signal.aborted ? `timeout after ${timeoutMs}ms` : describeError(error);
        this.logger.error(`File converter unreachable ${tag} ms=${elapsed()}: ${reason}`);
        throw new ServiceUnavailableException("File converter is unavailable");
      }

      const status = res.statusCode ?? 0;
      if (status === 413) {
        res.resume();
        this.logger.warn(`File converter rejected ${tag} as too large ms=${elapsed()}`);
        throw tooLarge(file.filename);
      }
      if (status < 200 || status >= 300) {
        const text = await readText(res).catch(() => "");
        let detail = text.slice(0, 500);
        try {
          detail = (JSON.parse(text) as { error?: string }).error ?? detail;
        } catch {}
        this.logger.warn(`Converting to PDF failed ${tag} status=${status} ms=${elapsed()}: ${detail}`);
        throw new UnprocessableEntityException({ code: "CONVERT_FAILED", message: `Cannot convert "${file.filename}" to PDF` });
      }

      // PDF ghi thẳng lên R2 theo luồng; service trả Content-Length (PDF từ tệp tạm). Thiếu thì gom vào RAM (PDF nhỏ)
      const pdfSize = Number(res.headers["content-length"]);
      if (Number.isFinite(pdfSize) && pdfSize > 0) {
        await this.uploadService.putPrivateObjectStream(targetKey, res, pdfSize, "application/pdf");
        this.logger.log(`Converted to PDF ${tag} pdfSize=${pdfSize} ms=${elapsed()}`);
        return { size: pdfSize };
      }
      const chunks: Buffer[] = [];
      for await (const chunk of res) chunks.push(chunk as Buffer);
      const pdf = Buffer.concat(chunks);
      await this.uploadService.putPrivateObject(targetKey, pdf, "application/pdf");
      this.logger.log(`Converted to PDF ${tag} pdfSize=${pdf.length} ms=${elapsed()}`);
      return { size: pdf.length };
    } catch (error) {
      // Lỗi giữa chừng (vd mất kết nối khi đang ghi PDF lên R2): dừng đọc tệp gốc
      source.body.destroy();
      if (abort.signal.aborted && !(error instanceof ServiceUnavailableException)) {
        this.logger.error(`Converting to PDF timed out ${tag} after ${timeoutMs}ms`);
        throw new ServiceUnavailableException("File converter timed out");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** POST luồng body; resolve khi nhận header response (body response đọc sau) */
  private post(url: URL, body: Readable, headers: Record<string, string>, signal: AbortSignal): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const send = url.protocol === "https:" ? httpsRequest : httpRequest;
      const req = send(url, { method: "POST", headers, signal }, resolve);
      req.on("error", reject);
      body.on("error", (error) => req.destroy(error));
      body.pipe(req);
    });
  }
}
