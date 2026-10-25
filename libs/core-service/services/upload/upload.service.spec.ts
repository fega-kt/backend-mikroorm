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

describe("UploadService.sniffMime (nhận dạng nội dung thật từ các byte đầu)", () => {
  const service = new UploadService();
  const sniff = (ext: string, bytes: Uint8Array, declared?: string) => service["sniffMime"](ext, bytes, declared);
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const text = Buffer.from("examplefile.com - Sample Files\n".repeat(200));
  const ole2 = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(4092)]);
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(4096)]);

  it("file text đổi đuôi .docx: không nhận dạng được, không dùng loại khai báo", async () => {
    expect(await sniff(".docx", text, DOCX)).toBeUndefined();
  });

  it("đuôi văn bản (.txt, .csv): dùng loại khai báo", async () => {
    expect(await sniff(".txt", text, "text/plain")).toBe("text/plain");
    expect(await sniff(".csv", text, "text/csv")).toBe("text/csv");
  });

  it("vỏ OLE2 với đuôi Office đời cũ: đúng loại của đuôi", async () => {
    expect(await sniff(".doc", ole2)).toBe("application/msword");
    expect(await sniff(".xls", ole2)).toBe("application/vnd.ms-excel");
  });

  it("vỏ ZIP với đuôi Office mới: đúng loại của đuôi; đuôi khác giữ nguyên application/zip", async () => {
    expect(await sniff(".docx", zip)).toBe(DOCX);
    expect(await sniff(".doc", zip)).toBe("application/zip");
  });
});
