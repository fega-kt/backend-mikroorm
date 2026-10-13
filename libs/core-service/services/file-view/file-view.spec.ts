import { describe, expect, it } from "vitest";
import { FileViewKind, resolveFileViewTarget } from "./file-view.constants";
import { signEditorConfig, signFileViewToken, verifyDocumentServerJwt, verifyFileViewToken } from "./file-view.token";

describe("resolveFileViewTarget", () => {
  it("file văn phòng xem bằng OnlyOffice theo đúng documentType", () => {
    expect(resolveFileViewTarget("hop-dong.DOCX")).toMatchObject({ kind: FileViewKind.Office, documentType: "word", ext: "docx" });
    expect(resolveFileViewTarget("bang-luong.xlsx")).toMatchObject({ kind: FileViewKind.Office, documentType: "cell" });
    expect(resolveFileViewTarget("trinh-bay.pptx")).toMatchObject({ kind: FileViewKind.Office, documentType: "slide" });
    expect(resolveFileViewTarget("scan.pdf")).toMatchObject({ kind: FileViewKind.Office, documentType: "pdf" });
  });

  it("ảnh, video, âm thanh xem bằng thẻ gốc của trình duyệt", () => {
    expect(resolveFileViewTarget("a.png").kind).toBe(FileViewKind.Image);
    expect(resolveFileViewTarget("a.jpeg").kind).toBe(FileViewKind.Image);
    expect(resolveFileViewTarget("a.mp4").kind).toBe(FileViewKind.Video);
    expect(resolveFileViewTarget("a.mp3").kind).toBe(FileViewKind.Audio);
  });

  it("svg, đuôi lạ và file không đuôi thì không xem được", () => {
    expect(resolveFileViewTarget("logo.svg").kind).toBe(FileViewKind.Unsupported);
    expect(resolveFileViewTarget("archive.zip").kind).toBe(FileViewKind.Unsupported);
    expect(resolveFileViewTarget("README").kind).toBe(FileViewKind.Unsupported);
  });
});

describe("file view token", () => {
  const secret = "test-secret";

  it("ký và kiểm lại đúng payload", async () => {
    const token = await signFileViewToken(secret, { fileId: "f1", userId: "u1", audience: "office" }, 60);
    await expect(verifyFileViewToken(secret, token)).resolves.toEqual({ fileId: "f1", userId: "u1", audience: "office" });
  });

  it("từ chối token sai secret, hết hạn hoặc không phải loại file-view", async () => {
    const token = await signFileViewToken(secret, { fileId: "f1", userId: "u1", audience: "native" }, 60);
    await expect(verifyFileViewToken("other", token)).rejects.toThrow();

    const expired = await signFileViewToken(secret, { fileId: "f1", userId: "u1", audience: "native" }, -10);
    await expect(verifyFileViewToken(secret, expired)).rejects.toThrow();

    // JWT cấu hình do Document Server ký cùng secret không được dùng làm token xem file
    const configToken = await signEditorConfig(secret, { document: { key: "x" } });
    await expect(verifyFileViewToken(secret, configToken)).rejects.toThrow();
    await expect(verifyDocumentServerJwt(secret, configToken)).resolves.toBeUndefined();
  });
});
