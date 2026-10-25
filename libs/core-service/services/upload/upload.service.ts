import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isPrivateStoragePath } from "@common/constants/storage.constant";
import { describeError } from "@common/utils/describe-error.util";
import { slugifyFilename } from "@common/utils/file-slug.util";
import { urlJoin } from "@common/utils/url-join";
import { ENV } from "@config/env.config";
import { AttachmentVisibility } from "../../entities/attachment";
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { fromBuffer } from "file-type";
import * as path from "path";
import { checkOfficeZip, hasOfficeZipParts } from "./office-zip";
import { type ByteRange, orderedParallelStream, parseContentRangeTotal, splitByteRanges } from "./parallel-range-stream";
import {
  ALLOWED_MIME_TYPES,
  CONTAINER_MIME_EXTENSIONS,
  DOWNLOAD_URL_TTL_SECONDS,
  EXT_MIME_MAP,
  INVALID_FILENAME_CHARS,
  MAX_FILENAME_LENGTH,
  MAX_PRIVATE_UPLOAD_SIZE,
  MULTIPART_MAX_PARTS,
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  pdfDownloadKeyOf,
  SNIFF_BYTES,
  TEXT_EXTENSIONS,
  UPLOAD_URL_TTL_SECONDS,
} from "./upload.constants";

/** Nội dung không phải loại của đuôi file (không nhận dạng được, hoặc văn bản Office thiếu thành phần) */
const invalidContent = (ext: string) =>
  new BadRequestException(`File content is not a valid "${ext}" file (the file may be damaged or renamed)`);

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
    if (!actualMime) throw invalidContent(ext);
    if (!ALLOWED_MIME_TYPES.includes(actualMime)) {
      throw new BadRequestException(`Actual file content type "${actualMime ?? "unknown"}" is not allowed`);
    }

    if (!EXT_MIME_MAP[ext].includes(actualMime)) {
      throw new BadRequestException(`File content type "${actualMime}" does not match extension "${ext}"`);
    }
  }

  /**
   * Loại nội dung thật từ các byte đầu file. Chỉ đuôi văn bản (không có chữ ký nhị phân) mới được lấy loại khai báo;
   * đuôi khác mà không nhận dạng được (vd file text đổi đuôi thành .docx) → undefined để bị từ chối
   */
  private async sniffMime(ext: string, bytes: Uint8Array, declared: string | undefined): Promise<string | undefined> {
    const detected = (await fromBuffer(bytes))?.mime;
    if (!detected) return TEXT_EXTENSIONS.has(ext) ? declared : undefined;
    // Vỏ OLE2 / ZIP đúng với đuôi Office → coi như đúng loại của đuôi đó
    return CONTAINER_MIME_EXTENSIONS[detected]?.includes(ext) ? EXT_MIME_MAP[ext][0] : detected;
  }

  /** docx / xlsx / pptx: mục lục ZIP phải có đủ thành phần (chặn file ZIP khác đổi đuôi, file bị cắt cụt) */
  private async assertOfficeZip(ext: string, size: number, read: (start: number, end: number) => Promise<Uint8Array>) {
    if (hasOfficeZipParts(ext) && (await checkOfficeZip(ext, size, read)) === "invalid") throw invalidContent(ext);
  }

  private async validateFile(file: Express.Multer.File): Promise<void> {
    const ext = this.assertFilenameAllowed(file.originalname);
    this.assertMimeAllowed(ext, await this.sniffMime(ext, file.buffer, file.mimetype));
    await this.assertOfficeZip(ext, file.buffer.length, async (start, end) => file.buffer.subarray(start, end));
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
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString();

    // File lớn: chia thành nhiều phần, mỗi phần một link ký riêng — đứt mạng chỉ phải gửi lại phần lỗi
    if (size > MULTIPART_THRESHOLD) {
      return { key, uploadUrl: "", headers: {}, expiresAt, multipart: await this.createMultipartUpload({ key, mimetype, size }) };
    }

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.privateBucket, Key: key, ContentType: mimetype, ContentLength: size }),
      // Ký cả loại và dung lượng: upload lệch khai báo sẽ bị R2 từ chối
      { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
    );

    return { key, uploadUrl, headers: { "Content-Type": mimetype }, expiresAt, multipart: undefined };
  }

  /** Mở upload nhiều phần và ký sẵn link PUT cho từng phần (mỗi link chỉ ghi đúng phần đó, đúng dung lượng phần đó) */
  private async createMultipartUpload(params: { key: string; mimetype: string; size: number }) {
    const { key, mimetype, size } = params;
    const created = await this.s3.send(new CreateMultipartUploadCommand({ Bucket: this.privateBucket, Key: key, ContentType: mimetype }));
    const uploadId = created.UploadId;
    if (!uploadId) throw new InternalServerErrorException("Could not start multipart upload");

    const partCount = Math.ceil(size / MULTIPART_PART_SIZE);
    try {
      const parts = await Promise.all(
        Array.from({ length: partCount }, async (_, i) => {
          const partNumber = i + 1;
          const contentLength = Math.min(MULTIPART_PART_SIZE, size - i * MULTIPART_PART_SIZE);
          const url = await getSignedUrl(
            this.s3,
            new UploadPartCommand({
              Bucket: this.privateBucket,
              Key: key,
              UploadId: uploadId,
              PartNumber: partNumber,
              ContentLength: contentLength,
            }),
            { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-length"]) },
          );
          return { partNumber, url };
        }),
      );
      return { uploadId, partSize: MULTIPART_PART_SIZE, parts };
    } catch (error) {
      await this.abortMultipartUpload(key, uploadId);
      throw error;
    }
  }

  /** Ghép các phần đã upload thành một object; lỗi thì hủy upload dở để R2 không giữ lại các phần mồ côi */
  async completeMultipartUpload(params: { key: string; uploadId: string; parts: { partNumber: number; etag: string }[] }) {
    const { key, uploadId, parts } = params;
    if (parts.length > MULTIPART_MAX_PARTS || new Set(parts.map((p) => p.partNumber)).size !== parts.length) {
      await this.abortMultipartUpload(key, uploadId);
      throw new BadRequestException("Invalid multipart parts");
    }
    try {
      await this.s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.privateBucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        }),
      );
    } catch (error) {
      this.logger.warn(`completeMultipartUpload key=${key} uploadId=${uploadId} parts=${parts.length} failed: ${describeError(error)}`);
      await this.abortMultipartUpload(key, uploadId);
      throw new BadRequestException("Could not assemble the uploaded file parts");
    }
  }

  /** Hủy upload nhiều phần dở dang (không ném lỗi: chỉ là dọn dẹp) */
  private async abortMultipartUpload(key: string, uploadId: string) {
    try {
      await this.s3.send(new AbortMultipartUploadCommand({ Bucket: this.privateBucket, Key: key, UploadId: uploadId }));
    } catch (error) {
      this.logger.warn(`abortMultipartUpload key=${key} uploadId=${uploadId} failed: ${describeError(error)}`);
    }
  }

  /**
   * Link tải object ở bucket private: ký thẳng tới R2 nên trình duyệt tải bằng mạng của chính người dùng, không qua backend.
   * R2 trả kèm Content-Disposition attachment với tên gốc (filename* UTF-8 cho tiếng Việt, filename ASCII dự phòng).
   */
  async createDownloadUrl(key: string, filename: string) {
    // Đuôi file đã được kiểm lúc upload (chỉ chữ và số); phần tên bỏ dấu cho trình duyệt không hiểu filename*
    const ext = path.extname(filename);
    const asciiName = `${slugifyFilename(path.basename(filename, ext))}${ext.toLowerCase()}`;
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.privateBucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString() };
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
    } catch (error) {
      this.logger.warn(`verifyUploadedObject key=${key}: object not found or unreadable: ${describeError(error)}`);
      throw new BadRequestException("File has not been uploaded");
    }

    try {
      if (head.ContentLength !== expectedSize) {
        throw new BadRequestException("Uploaded file size does not match the declared size");
      }
      const part = await this.s3.send(new GetObjectCommand({ Bucket: this.privateBucket, Key: key, Range: `bytes=0-${SNIFF_BYTES - 1}` }));
      const bytes = Buffer.from((await part.Body?.transformToByteArray()) ?? []);
      this.assertMimeAllowed(ext, await this.sniffMime(ext, bytes, head.ContentType));
      await this.assertOfficeZip(ext, expectedSize, async (start, end) => {
        const range = await this.s3.send(
          new GetObjectCommand({ Bucket: this.privateBucket, Key: key, Range: `bytes=${start}-${end - 1}` }),
        );
        return (await range.Body?.transformToByteArray()) ?? new Uint8Array();
      });
    } catch (error) {
      this.logger.warn(`verifyUploadedObject key=${key} filename=${filename} rejected, deleting object: ${describeError(error)}`);
      await this.deleteObject(key).catch((deleteError) =>
        this.logger.error(`Cannot delete rejected object key=${key} (orphan left on R2): ${describeError(deleteError)}`),
      );
      throw error;
    }
  }

  /** Xóa object ở bucket private (file lỗi hoặc upload dở) */
  async deleteObject(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.privateBucket, Key: key }));
  }

  /** Xóa mọi object của một tệp private: file gốc, bản xem và bản PDF tải về (nếu có; xóa key không tồn tại vẫn thành công) */
  async deleteAttachmentObjects(attachment: { key: string; previewKey?: string | null }) {
    const keys = [attachment.key, attachment.previewKey, pdfDownloadKeyOf(attachment.key)];
    await Promise.all(keys.filter((key): key is string => !!key).map((key) => this.deleteObject(key)));
  }

  /** Object có trong bucket private không */
  async privateObjectExists(key: string): Promise<boolean> {
    return this.objectExists(key);
  }

  /**
   * Sao chép một object trong bucket private sang thư mục khác (copy phía R2, không tải về); giữ tên file,
   * trùng tên trong thư mục đích thì thêm hậu tố -2, -3… Trả về key mới.
   */
  async copyPrivateObject(sourceKey: string, folder: string, filename: string): Promise<string> {
    const key = await this.buildUniqueKey(folder, filename.trim(), path.extname(filename).toLowerCase());
    await this.copyPrivateObjectTo(sourceKey, key);
    return key;
  }

  /** Sao chép object trong bucket private sang đúng key cho trước (vd bản xem đi kèm tệp đã sao chép) */
  async copyPrivateObjectTo(sourceKey: string, targetKey: string) {
    const source = `${this.privateBucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`;
    await this.s3.send(new CopyObjectCommand({ Bucket: this.privateBucket, Key: targetKey, CopySource: source }));
  }

  /**
   * Ghi object mới vào thư mục của bucket private: tên file + mã ngẫu nhiên (vd bao-cao-1a2b3c4d.pdf); trả về key.
   * Không "hỏi có chưa rồi mới ghi" như buildUniqueKey: hai luồng chạy song song (job chuyển PDF ở nền và hộp ký)
   * cùng thấy tên trống rồi ghi đè lên nhau, một bên xóa bản "thừa" của mình là xóa luôn file bên kia đang dùng
   */
  async putPrivateObjectUnique(folder: string, filename: string, body: Uint8Array, contentType: string): Promise<string> {
    const key = this.newUniquePrivateKey(folder, filename);
    await this.putPrivateObject(key, body, contentType);
    return key;
  }

  /** Key mới cho object sắp ghi vào thư mục của bucket private: tên file + mã ngẫu nhiên (cùng quy tắc putPrivateObjectUnique) */
  newUniquePrivateKey(folder: string, filename: string): string {
    const name = filename.trim();
    const ext = path.extname(name).toLowerCase();
    const base = slugifyFilename(path.basename(name, path.extname(name)));
    return urlJoin([folder, `${base}-${randomUUID().slice(0, 8)}${ext}`], { removeLeadingSlash: true, removeTrailingSlash: true });
  }

  /** Ghi object vào bucket private từ server (vd bản xem do job tạo) */
  async putPrivateObject(key: string, body: Uint8Array, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.privateBucket, Key: key, Body: body, ContentType: contentType }));
  }

  /** Ghi object vào bucket private từ luồng (tệp lớn, không giữ cả tệp trong RAM); R2 cần biết trước dung lượng */
  async putPrivateObjectStream(key: string, body: Readable, size: number, contentType: string) {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.privateBucket, Key: key, Body: body, ContentLength: size, ContentType: contentType }),
    );
  }

  /** Đọc trọn một object ở bucket private vào bộ nhớ (job xử lý file; không dùng cho file quá lớn) */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const { body } = await this.getObject(key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
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
        this.logger.warn(
          `getObject key=${key} range=${range.start}-${range.end} attempt=${attempt}/${attempts} failed: ${describeError(error)}`,
        );
      }
    }
  }
}
