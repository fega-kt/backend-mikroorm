import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isPrivateStoragePath } from "@common/constants/storage.constant";
import { slugifyFilename } from "@common/utils/file-slug.util";
import { urlJoin } from "@common/utils/url-join";
import { ENV } from "@config/env.config";
import { AttachmentVisibility } from "../../entities/attachment";
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { fromBuffer } from "file-type";
import * as path from "path";
import { type ByteRange, orderedParallelStream, parseContentRangeTotal, splitByteRanges } from "./parallel-range-stream";
import {
  ALLOWED_MIME_TYPES,
  EXT_MIME_MAP,
  INVALID_FILENAME_CHARS,
  MAX_FILENAME_LENGTH,
  MAX_PRIVATE_UPLOAD_SIZE,
  SNIFF_BYTES,
  UPLOAD_URL_TTL_SECONDS,
} from "./upload.constants";

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3 = new S3Client({
    region: "auto",
    endpoint: `https://${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ENV.R2_ACCESS_KEY_ID,
      secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  /** Kiểm tên file (rỗng, độ dài, ký tự cấm, đuôi được phép); trả về đuôi file (có dấu chấm, chữ thường) */
  private assertFilenameAllowed(rawName: string): string {
    const filename = rawName.trim();

    if (!filename || filename.trim().length === 0) {
      throw new BadRequestException("Filename cannot be empty");
    }

    if (filename.length > MAX_FILENAME_LENGTH) {
      throw new BadRequestException(`Filename must not exceed ${MAX_FILENAME_LENGTH} characters`);
    }

    if (INVALID_FILENAME_CHARS.test(filename)) {
      throw new BadRequestException("Filename contains invalid characters");
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ext) {
      throw new BadRequestException("Filename must have an extension");
    }

    if (!EXT_MIME_MAP[ext]) {
      throw new BadRequestException(`Extension "${ext}" is not allowed`);
    }
    return ext;
  }

  /** Loại nội dung thật (hoặc khai báo) phải nằm trong danh sách cho phép và khớp với đuôi file */
  private assertMimeAllowed(ext: string, actualMime: string | undefined): void {
    if (!actualMime || !ALLOWED_MIME_TYPES.includes(actualMime)) {
      throw new BadRequestException(`Actual file content type "${actualMime ?? "unknown"}" is not allowed`);
    }

    if (!EXT_MIME_MAP[ext].includes(actualMime)) {
      throw new BadRequestException(`File content type "${actualMime}" does not match extension "${ext}"`);
    }
  }

  private async validateFile(file: Express.Multer.File): Promise<void> {
    const ext = this.assertFilenameAllowed(file.originalname);
    const detected = await fromBuffer(file.buffer);
    this.assertMimeAllowed(ext, detected?.mime || file.mimetype);
  }

  /** Bucket private; thiếu cấu hình thì báo lỗi, tuyệt đối không rơi về bucket public */
  private get privateBucket(): string {
    if (!ENV.R2_PRIVATE_BUCKET) {
      throw new InternalServerErrorException("R2_PRIVATE_BUCKET is not configured");
    }
    return ENV.R2_PRIVATE_BUCKET;
  }

  private buildKey(filePath: string, filename: string): string {
    return urlJoin([filePath, `${randomUUID()}-${filename}`], {
      removeLeadingSlash: true,
      removeTrailingSlash: true,
    });
  }

  /** Key `{folder}/{ten-file}.{ext}`; trùng tên trong cùng thư mục thì thêm hậu tố -2, -3… để không ghi đè file có sẵn */
  private async buildUniqueKey(folder: string, filename: string, ext: string): Promise<string> {
    const base = slugifyFilename(path.basename(filename, path.extname(filename)));
    const MAX_TRIES = 20;
    for (let i = 1; i <= MAX_TRIES; i++) {
      const key = urlJoin([folder, `${base}${i === 1 ? "" : `-${i}`}${ext}`], { removeLeadingSlash: true, removeTrailingSlash: true });
      if (!(await this.objectExists(key))) return key;
    }
    // Quá nhiều file trùng tên: dùng mã ngẫu nhiên để chắc chắn không đè
    return urlJoin([folder, `${base}-${randomUUID().slice(0, 8)}${ext}`], { removeLeadingSlash: true, removeTrailingSlash: true });
  }

  private async objectExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.privateBucket, Key: key }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return false;
      throw error;
    }
  }

  async upload(file: Express.Multer.File, filePath: string = "uploads") {
    await this.validateFile(file);

    const isPrivate = isPrivateStoragePath(filePath);
    const bucket = isPrivate ? this.privateBucket : ENV.R2_BUCKET;

    const key = this.buildKey(filePath, file.originalname);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return {
      key,
      // File private không có URL công khai: phải xin link ký qua createDownloadUrl
      url: isPrivate ? "" : `${ENV.R2_PUBLIC_URL}/${key}`,
      visibility: isPrivate ? AttachmentVisibility.Private : AttachmentVisibility.Public,
    };
  }

  /**
   * Link upload thẳng lên bucket private (presigned PUT) cho file lớn — dữ liệu không đi qua backend.
   * Kiểm trước những gì kiểm được từ khai báo (đuôi, loại, dung lượng); nội dung thật được xác minh ở inspectObject
   * sau khi upload xong. Link chỉ ghi được đúng một key, đúng loại và đúng dung lượng đã khai.
   * `folder` là thư mục đích (vd: Attachments/{requestId}/documents), tên file trong key được làm sạch và chống trùng.
   */
  async createUploadUrl(params: { folder: string; filename: string; mimetype: string; size: number }) {
    const { folder, filename, mimetype, size } = params;

    if (!isPrivateStoragePath(folder)) {
      throw new BadRequestException("Presigned upload is only available for private storage paths");
    }
    const ext = this.assertFilenameAllowed(filename);
    this.assertMimeAllowed(ext, mimetype);
    if (!Number.isInteger(size) || size <= 0 || size > MAX_PRIVATE_UPLOAD_SIZE) {
      throw new BadRequestException(`File size must be between 1 byte and ${MAX_PRIVATE_UPLOAD_SIZE} bytes`);
    }

    const key = await this.buildUniqueKey(folder, filename.trim(), ext);
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.privateBucket, Key: key, ContentType: mimetype, ContentLength: size }),
      // Ký cả loại và dung lượng: upload lệch khai báo sẽ bị R2 từ chối
      { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
    );

    return {
      key,
      uploadUrl,
      headers: { "Content-Type": mimetype },
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Xác minh file vừa upload thẳng lên bucket private: tồn tại, đúng dung lượng đã khai,
   * và nội dung thật (đọc vài KB đầu) khớp với đuôi file. Sai thì xóa object và báo lỗi.
   */
  async verifyUploadedObject(params: { key: string; filename: string; expectedSize: number }) {
    const { key, filename, expectedSize } = params;
    const ext = this.assertFilenameAllowed(filename);

    let head;
    try {
      head = await this.s3.send(new HeadObjectCommand({ Bucket: this.privateBucket, Key: key }));
    } catch {
      throw new BadRequestException("File has not been uploaded");
    }

    try {
      if (head.ContentLength !== expectedSize) {
        throw new BadRequestException("Uploaded file size does not match the declared size");
      }
      const part = await this.s3.send(new GetObjectCommand({ Bucket: this.privateBucket, Key: key, Range: `bytes=0-${SNIFF_BYTES - 1}` }));
      const bytes = Buffer.from((await part.Body?.transformToByteArray()) ?? []);
      const detected = await fromBuffer(bytes);
      this.assertMimeAllowed(ext, detected?.mime || head.ContentType);
    } catch (error) {
      await this.deleteObject(key).catch(() => undefined);
      throw error;
    }
  }

  /** Xóa object ở bucket private (file lỗi hoặc upload dở) */
  async deleteObject(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.privateBucket, Key: key }));
  }

  /**
   * Đọc object ở bucket private dạng stream (hỗ trợ Range để tua video).
   * Backend là bên duy nhất chạm vào bucket khi xem file: người xem không bao giờ nhận link tải tới R2.
   *
   * Đọc cả object (không có Range, vd Document Server tải file) thì chia thành nhiều đoạn tải song song
   * (R2_PARALLEL_DOWNLOADS kết nối, mỗi đoạn R2_PARALLEL_CHUNK_SIZE_MB) rồi ghép đúng thứ tự;
   * người nhận vẫn thấy một response 200 bình thường.
   */
  async getObject(key: string, range?: string) {
    const concurrency = ENV.R2_PARALLEL_DOWNLOADS;
    const chunkSize = ENV.R2_PARALLEL_CHUNK_SIZE_MB * 1024 * 1024;
    const parallel = !range && concurrency > 1 && chunkSize > 0;

    const startedAt = performance.now();
    // Tải song song: mở đoạn đầu trước để biết tổng dung lượng (Content-Range) và loại nội dung
    const firstRange = parallel ? `bytes=0-${chunkSize - 1}` : range;
    const result = await this.s3.send(new GetObjectCommand({ Bucket: this.privateBucket, Key: key, Range: firstRange }));
    // Đo hiệu năng xem file: thời gian R2 trả header (chưa gồm tải body) và metadata object
    this.logger.log(
      `getObject key=${key} range=${range ?? "-"} parallel=${parallel ? `${concurrency}x${ENV.R2_PARALLEL_CHUNK_SIZE_MB}MB` : "off"} ` +
        `headersMs=${Math.round(performance.now() - startedAt)} contentLength=${result.ContentLength ?? "-"} ` +
        `contentRange=${result.ContentRange ?? "-"} contentType=${result.ContentType ?? "-"}`,
    );

    if (parallel) {
      const total = parseContentRangeTotal(result.ContentRange) ?? result.ContentLength;
      const rest = total === undefined ? [] : splitByteRanges(chunkSize, total, chunkSize);
      return {
        // Object không lớn hơn một đoạn: đoạn đầu đã là cả object
        body: rest.length
          ? orderedParallelStream(rest, concurrency, (r, signal) => this.fetchRange(key, r, signal), result.Body as Readable)
          : (result.Body as Readable),
        contentType: result.ContentType,
        contentLength: total,
        contentRange: undefined,
        partial: false,
      };
    }

    return {
      body: result.Body as Readable,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      contentRange: result.ContentRange,
      partial: !!result.ContentRange,
    };
  }

  /** Tải trọn một đoạn của object vào bộ nhớ (thử lại tối đa 3 lần nếu đứt giữa chừng, trừ khi đã bị hủy) */
  private async fetchRange(key: string, range: ByteRange, signal: AbortSignal): Promise<Uint8Array> {
    const attempts = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await this.s3.send(
          new GetObjectCommand({ Bucket: this.privateBucket, Key: key, Range: `bytes=${range.start}-${range.end}` }),
          { abortSignal: signal },
        );
        return await result.Body.transformToByteArray();
      } catch (error) {
        if (signal.aborted || attempt >= attempts) throw error;
        this.logger.warn(`getObject key=${key} range=${range.start}-${range.end} attempt=${attempt} failed: ${String(error)}`);
      }
    }
  }
}
