import { ENV } from "@config/env.config";
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AttachmentVisibility, type AttachmentEntity } from "../../entities/attachment";
import { FileContextType, type FileAccessPolicy } from "./file-access-policy";
import { FileViewKind } from "./file-view.constants";
import { FileViewService } from "./file-view.service";

const file = (overrides: Partial<AttachmentEntity> = {}) =>
  ({
    id: "file-1",
    filename: "logo.svg",
    mimetype: "image/svg+xml",
    size: 10,
    visibility: AttachmentVisibility.Private,
    contextType: FileContextType.ApprovalRequest,
    refId: "req-1",
    ...overrides,
  }) as AttachmentEntity;

interface BuildOptions {
  stored?: AttachmentEntity | null;
  policies?: FileAccessPolicy[];
  user?: object | null;
}

const build = ({ stored = file(), policies = [], user = { id: "u1", fullName: "User" } }: BuildOptions) =>
  new FileViewService(
    { findOne: vi.fn().mockResolvedValue(stored) } as never,
    {} as never,
    {} as never,
    { user: user ?? undefined, headers: {} } as never,
    policies,
  );

describe("FileViewService.describe — chỉ cần id tệp, phân quyền theo ngữ cảnh lưu trên tệp", () => {
  it("lấy ngữ cảnh và refId từ bản ghi tệp rồi chuyển cho policy đúng loại", async () => {
    const resolveFile = vi.fn().mockResolvedValue(file());
    const service = build({ policies: [{ contextType: FileContextType.ApprovalRequest, resolveFile }] });

    const result = await service.describe("file-1");

    expect(resolveFile).toHaveBeenCalledWith("req-1", "file-1");
    expect(result.kind).toBe(FileViewKind.Unsupported);
  });

  it("tệp không tồn tại hoặc chưa có chủ sở hữu thì không xem được", async () => {
    const resolveFile = vi.fn();
    const policies = [{ contextType: FileContextType.ApprovalRequest, resolveFile }];

    await expect(build({ stored: null, policies }).describe("file-1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ stored: file({ contextType: null, refId: null }), policies }).describe("file-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(resolveFile).not.toHaveBeenCalled();
  });

  it("ngữ cảnh chưa có policy thì từ chối (không mặc định cho xem)", async () => {
    await expect(build({ policies: [] }).describe("file-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("policy không cho xem thì lỗi của policy được giữ nguyên", async () => {
    const resolveFile = vi.fn().mockRejectedValue(new ForbiddenException("You cannot view this request"));
    const service = build({ policies: [{ contextType: FileContextType.ApprovalRequest, resolveFile }] });
    await expect(service.describe("file-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("chưa đăng nhập thì không đọc tệp và không vào policy", async () => {
    const resolveFile = vi.fn();
    const service = build({ policies: [{ contextType: FileContextType.ApprovalRequest, resolveFile }], user: null });
    await expect(service.describe("file-1")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolveFile).not.toHaveBeenCalled();
  });
});

describe("FileViewService.createDownloadUrl — cùng quyền với xem tệp", () => {
  const buildWithUpload = (options: BuildOptions, createDownloadUrl = vi.fn().mockResolvedValue({ url: "signed", expiresAt: "x" })) => ({
    createDownloadUrl,
    service: new FileViewService(
      { findOne: vi.fn().mockResolvedValue(options.stored === undefined ? file() : options.stored) } as never,
      { createDownloadUrl } as never,
      {} as never,
      { user: options.user === null ? undefined : (options.user ?? { id: "u1", fullName: "User" }), headers: {} } as never,
      options.policies ?? [],
    ),
  });

  it("policy cho xem thì cấp link tải theo key và tên gốc của tệp do policy trả về", async () => {
    const resolved = file({ key: "Attachments/req-1/documents/hop-dong.pdf", filename: "Hợp đồng.pdf" });
    const { service, createDownloadUrl } = buildWithUpload({
      policies: [{ contextType: FileContextType.ApprovalRequest, resolveFile: vi.fn().mockResolvedValue(resolved) }],
    });
    await expect(service.createDownloadUrl("file-1")).resolves.toEqual({ url: "signed", expiresAt: "x" });
    expect(createDownloadUrl).toHaveBeenCalledWith("Attachments/req-1/documents/hop-dong.pdf", "Hợp đồng.pdf");
  });

  it("policy không cho xem hoặc chưa đăng nhập thì không cấp link", async () => {
    const denied = buildWithUpload({
      policies: [{ contextType: FileContextType.ApprovalRequest, resolveFile: vi.fn().mockRejectedValue(new ForbiddenException()) }],
    });
    await expect(denied.service.createDownloadUrl("file-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.createDownloadUrl).not.toHaveBeenCalled();

    const anonymous = buildWithUpload({ user: null });
    await expect(anonymous.service.createDownloadUrl("file-1")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(anonymous.createDownloadUrl).not.toHaveBeenCalled();
  });
});

describe("FileViewService.createPdfDownloadUrl — tải bản PDF", () => {
  const buildPdfDownload = (resolved: AttachmentEntity, pdfExists = false) => {
    const upload = {
      createDownloadUrl: vi.fn().mockResolvedValue({ url: "signed", expiresAt: "x" }),
      privateObjectExists: vi.fn().mockResolvedValue(pdfExists),
      putPrivateObject: vi.fn().mockResolvedValue(undefined),
    };
    const converter = { toPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7")) };
    const service = new FileViewService(
      { findOne: vi.fn().mockResolvedValue(resolved) } as never,
      upload as never,
      converter as never,
      { user: { id: "u1", fullName: "User" }, headers: {} } as never,
      [{ contextType: FileContextType.ApprovalRequest, resolveFile: vi.fn().mockResolvedValue(resolved) }],
    );
    return { service, upload, converter };
  };

  it("tệp PDF: tải thẳng tệp, không chuyển", async () => {
    const { service, upload, converter } = buildPdfDownload(file({ key: "Attachments/r/scan.pdf", filename: "Scan.pdf" }));
    await service.createPdfDownloadUrl("file-1");
    expect(upload.createDownloadUrl).toHaveBeenCalledWith("Attachments/r/scan.pdf", "Scan.pdf");
    expect(converter.toPdf).not.toHaveBeenCalled();
  });

  it("Word lần đầu: chuyển sang PDF, lưu ở Previews/{key}.pdf, tải về tên {tên}.pdf", async () => {
    const word = file({ key: "Attachments/r/de-xuat.docx", filename: "Đề xuất.docx" });
    const { service, upload, converter } = buildPdfDownload(word);
    await service.createPdfDownloadUrl("file-1");
    expect(converter.toPdf).toHaveBeenCalledWith(word);
    expect(upload.putPrivateObject).toHaveBeenCalledWith("Previews/Attachments/r/de-xuat.docx.pdf", expect.any(Buffer), "application/pdf");
    expect(upload.createDownloadUrl).toHaveBeenCalledWith("Previews/Attachments/r/de-xuat.docx.pdf", "Đề xuất.pdf");
  });

  it("Word đã có bản PDF lưu sẵn: tải ngay, không chuyển lại", async () => {
    const { service, upload, converter } = buildPdfDownload(file({ key: "Attachments/r/de-xuat.docx", filename: "Đề xuất.docx" }), true);
    await service.createPdfDownloadUrl("file-1");
    expect(converter.toPdf).not.toHaveBeenCalled();
    expect(upload.putPrivateObject).not.toHaveBeenCalled();
    expect(upload.createDownloadUrl).toHaveBeenCalledWith("Previews/Attachments/r/de-xuat.docx.pdf", "Đề xuất.pdf");
  });

  it("tệp không chuyển được sang PDF (ảnh, zip…) thì báo lỗi", async () => {
    const { service, converter } = buildPdfDownload(file({ key: "Attachments/r/anh.png", filename: "anh.png" }));
    await expect(service.createPdfDownloadUrl("file-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(converter.toPdf).not.toHaveBeenCalled();
  });
});

describe("FileViewService.describe — setting PDF_VIEWER", () => {
  const pdf = file({ filename: "scan.pdf", mimetype: "application/pdf" });
  const buildPdf = (settingValue: unknown) => {
    const settingFind = vi.fn().mockResolvedValue(settingValue === undefined ? null : { value: settingValue });
    return new FileViewService(
      { findOne: vi.fn().mockResolvedValue(pdf), getEntityManager: () => ({ findOne: settingFind }) } as never,
      {} as never,
      {} as never,
      { user: { id: "u1", fullName: "User" }, headers: {} } as never,
      [{ contextType: FileContextType.ApprovalRequest, resolveFile: vi.fn().mockResolvedValue(pdf) }],
    );
  };
  const withOnlyOffice = (configured: boolean, run: () => Promise<void>) => async () => {
    const saved = { ...ENV };
    Object.assign(ENV, {
      ONLYOFFICE_JWT_SECRET: "test-secret-test-secret-test-secret",
      ONLYOFFICE_URL: configured ? "https://office.test" : undefined,
      ONLYOFFICE_FILE_BASE_URL: configured ? "https://api.test" : undefined,
    });
    try {
      await run();
    } finally {
      Object.assign(ENV, saved);
    }
  };

  it(
    "chưa cấu hình / chọn pdfjs: xem bằng pdf.js",
    withOnlyOffice(true, async () => {
      expect((await buildPdf(undefined).describe("file-1")).kind).toBe(FileViewKind.Pdf);
      expect((await buildPdf("pdfjs").describe("file-1")).kind).toBe(FileViewKind.Pdf);
    }),
  );

  it(
    "chọn onlyoffice: xem bằng OnlyOffice với documentType pdf",
    withOnlyOffice(true, async () => {
      const result = await buildPdf("onlyoffice").describe("file-1");
      expect(result.kind).toBe(FileViewKind.Office);
      expect((result as { config?: { documentType?: string } }).config?.documentType).toBe("pdf");
    }),
  );

  it(
    "chọn onlyoffice nhưng chưa cấu hình OnlyOffice: vẫn dùng pdf.js",
    withOnlyOffice(false, async () => {
      expect((await buildPdf("onlyoffice").describe("file-1")).kind).toBe(FileViewKind.Pdf);
    }),
  );
});
