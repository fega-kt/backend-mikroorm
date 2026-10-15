import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { MAX_PRIVATE_UPLOAD_SIZE, MULTIPART_MAX_PARTS } from "./upload.constants";
import { UploadService } from "./upload.service";

describe("UploadService.createUploadUrl (kiểm khai báo trước khi ký link)", () => {
  const service = new UploadService();
  const base = { folder: "Attachments/req-1/documents", filename: "hop-dong.pdf", mimetype: "application/pdf", size: 1024 };

  it("từ chối thư mục không phải private", async () => {
    await expect(service.createUploadUrl({ ...base, folder: "UserAvatars" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("từ chối đuôi file không được phép", async () => {
    await expect(service.createUploadUrl({ ...base, filename: "virus.exe", mimetype: "application/x-msdownload" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("từ chối loại khai báo không khớp đuôi file", async () => {
    await expect(service.createUploadUrl({ ...base, mimetype: "image/png" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("từ chối dung lượng 0 hoặc vượt trần", async () => {
    await expect(service.createUploadUrl({ ...base, size: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createUploadUrl({ ...base, size: MAX_PRIVATE_UPLOAD_SIZE + 1 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("UploadService.completeMultipartUpload (kiểm danh sách phần)", () => {
  const service = new UploadService();

  it("từ chối số phần trùng nhau", async () => {
    const parts = [
      { partNumber: 1, etag: "a" },
      { partNumber: 1, etag: "b" },
    ];
    await expect(service.completeMultipartUpload({ key: "k", uploadId: "u", parts })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("từ chối quá số phần tối đa", async () => {
    const parts = Array.from({ length: MULTIPART_MAX_PARTS + 1 }, (_, i) => ({ partNumber: i + 1, etag: "x" }));
    await expect(service.completeMultipartUpload({ key: "k", uploadId: "u", parts })).rejects.toBeInstanceOf(BadRequestException);
  });
});
