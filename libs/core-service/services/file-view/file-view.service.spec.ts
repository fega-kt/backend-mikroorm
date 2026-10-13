import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
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
