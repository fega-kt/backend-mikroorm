import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { urlJoin } from "@common/utils/url-join";
import { ENV } from "@config/env.config";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
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

  async upload(file: Express.Multer.File, path: string = "test") {
    const key = urlJoin([path, `${randomUUID()}-${file.originalname}`], {
      removeLeadingSlash: true,
      removeTrailingSlash: true,
    });

    await this.s3.send(
      new PutObjectCommand({
        Bucket: ENV.R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    return {
      key,
      url: `${ENV.R2_PUBLIC_URL}/${key}`,
    };
  }
}
