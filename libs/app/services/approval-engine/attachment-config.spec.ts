import { describe, expect, it } from "vitest";
import { FileKind, fileBlockConfigSchema, requestFilesError, resolveAttachmentConfig, validateFileBlock } from "./attachment-config";

const MB = 1024 * 1024;

describe("attachment-config", () => {
  it("falls back to defaults when the request type has no config", () => {
    const config = resolveAttachmentConfig(null);
    expect(config.documents).toMatchObject({ enabled: true, required: false, minFiles: 1, maxFiles: 5 });
    expect(config.attachments).toMatchObject({ enabled: true, required: false, maxFiles: 20 });
  });

  it("requires at least minFiles when required", () => {
    const config = fileBlockConfigSchema.parse({ required: true, minFiles: 2, fileTypes: [FileKind.Pdf] });
    expect(validateFileBlock(config, [{ filename: "a.pdf", size: MB }])).toEqual([{ code: "MIN_FILES", min: 2 }]);
    expect(validateFileBlock(config, [])).toEqual([{ code: "MIN_FILES", min: 2 }]);
  });

  it("allows an empty optional block but checks limits", () => {
    const config = fileBlockConfigSchema.parse({ required: false, maxFiles: 1, fileTypes: [FileKind.Pdf] });
    expect(validateFileBlock(config, [])).toEqual([]);
    expect(
      validateFileBlock(config, [
        { filename: "a.pdf", size: 1 },
        { filename: "b.pdf", size: 1 },
      ]),
    ).toEqual([{ code: "MAX_FILES", max: 1 }]);
  });

  it("checks file types by extension and size", () => {
    const config = fileBlockConfigSchema.parse({ fileTypes: [FileKind.Word], maxSizeMb: 2 });
    expect(
      validateFileBlock(config, [
        { filename: "ok.DOCX", size: MB },
        { filename: "img.png", size: MB },
        { filename: "big.doc", size: 3 * MB },
      ]),
    ).toEqual([
      { code: "FILE_TYPE", filename: "img.png" },
      { code: "FILE_SIZE", filename: "big.doc", maxSizeMb: 2 },
    ]);
  });

  it("rejects files in a disabled block", () => {
    const config = fileBlockConfigSchema.parse({ enabled: false });
    expect(validateFileBlock(config, [{ filename: "a.pdf", size: 1 }])).toEqual([{ code: "DISABLED" }]);
    expect(validateFileBlock(config, [])).toEqual([]);
  });
});

describe("requestFilesError", () => {
  const config = { documents: { required: true, fileTypes: [FileKind.Pdf] }, attachments: { required: false, maxFiles: 1 } };

  it("báo lỗi của cả hai khối, kèm tên tệp sai loại", () => {
    expect(requestFilesError(config, { documents: [], attachments: [{ filename: "a.exe", size: 1 }] })).toBe(
      "documents.MIN_FILES, attachments.FILE_TYPE(a.exe)",
    );
  });

  it("null khi bộ tệp hợp lệ", () => {
    expect(requestFilesError(config, { documents: [{ filename: "to-trinh.pdf", size: 1 }], attachments: [] })).toBeNull();
  });
});
