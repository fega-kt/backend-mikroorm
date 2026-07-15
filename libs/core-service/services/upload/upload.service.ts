import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { urlJoin } from "@common/utils/url-join";
import { ENV } from "@config/env.config";
import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { fromBuffer } from "file-type";
import * as path from "path";
import { ALLOWED_MIME_TYPES, EXT_MIME_MAP, INVALID_FILENAME_CHARS, MAX_FILENAME_LENGTH } from "./upload.constants";

@Injectable()
export class UploadService {
  private s3 = new S3Client({
    region: "auto",
    endpoint: `https://${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ENV.R2_ACCESS_KEY_ID,
      secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  private async validateFile(file: Express.Multer.File): Promise<void> {
    const filename = file.originalname.trim();

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

    const allowedMimesForExt = EXT_MIME_MAP[ext];
    if (!allowedMimesForExt) {
      throw new BadRequestException(`Extension "${ext}" is not allowed`);
    }

    const detected = await fromBuffer(file.buffer);
    const actualMime = detected?.mime || file.mimetype;

    if (!actualMime || !ALLOWED_MIME_TYPES.includes(actualMime)) {
      throw new BadRequestException(`Actual file content type "${actualMime ?? "unknown"}" is not allowed`);
    }

    if (!allowedMimesForExt.includes(actualMime)) {
      throw new BadRequestException(`File content type "${actualMime}" does not match extension "${ext}"`);
    }
  }

  async upload(file: Express.Multer.File, filePath: string = "uploads") {
    await this.validateFile(file);

    const key = urlJoin([filePath, `${randomUUID()}-${file.originalname}`], {
      removeLeadingSlash: true,
      removeTrailingSlash: true,
    });

    await this.s3.send(
      new PutObjectCommand({
        Bucket: ENV.R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return {
      key,
      url: `${ENV.R2_PUBLIC_URL}/${key}`,
    };
  }
}
