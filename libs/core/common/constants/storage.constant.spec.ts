import { describe, expect, it } from "vitest";
import { isPrivateStoragePath, STORAGE_PATH } from "./storage.constant";

describe("isPrivateStoragePath", () => {
  it("coi thư mục Attachments (và thư mục con) là private", () => {
    expect(isPrivateStoragePath(STORAGE_PATH.ATTACHMENTS)).toBe(true);
    expect(isPrivateStoragePath(`${STORAGE_PATH.ATTACHMENTS}/2026-10-13/abc`)).toBe(true);
  });

  it("giữ avatar, danh mục, dự án ở bucket public", () => {
    expect(isPrivateStoragePath(STORAGE_PATH.USER_AVATAR)).toBe(false);
    expect(isPrivateStoragePath(`${STORAGE_PATH.CATEGORY}/x`)).toBe(false);
    expect(isPrivateStoragePath(`${STORAGE_PATH.PROJECT}/2026-10-13/p1`)).toBe(false);
  });

  it("không nhận nhầm thư mục chỉ trùng tiền tố tên", () => {
    expect(isPrivateStoragePath("AttachmentsEvil")).toBe(false);
  });
});
