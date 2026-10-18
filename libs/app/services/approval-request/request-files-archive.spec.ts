import { describe, expect, it } from "vitest";
import type { ApprovalRequestFileEntity } from "../../entities/approval-request-file";
import { RequestFileCategory } from "./request-file.constants";
import { archiveFilename, buildArchiveEntries, RequestArchiveKind } from "./request-files-archive";

const attachment = (filename: string, size = 10) => ({ key: `k/${filename}`, filename, size });

/** Dòng tệp của vòng: current khác original khi đã chuyển PDF / đã ký */
const row = (category: RequestFileCategory, original: string, current = original) =>
  ({ category, original: attachment(original), current: attachment(current, 20) }) as unknown as ApprovalRequestFileEntity;

describe("buildArchiveEntries", () => {
  it("bản ký số: chỉ văn bản tờ trình, lấy bản hiện tại, để phẳng", () => {
    const rows = [
      row(RequestFileCategory.Documents, "To trinh.docx", "To trinh.pdf"),
      row(RequestFileCategory.Documents, "Bao gia.pdf"),
      row(RequestFileCategory.Attachments, "Anh.png"),
    ];
    expect(buildArchiveEntries(rows, RequestArchiveKind.Signed)).toEqual([
      { key: "k/To trinh.pdf", name: "To trinh.pdf", size: 20 },
      { key: "k/Bao gia.pdf", name: "Bao gia.pdf", size: 20 },
    ]);
  });

  it("tệp gốc: văn bản và tài liệu đính kèm chia thư mục", () => {
    const rows = [row(RequestFileCategory.Documents, "To trinh.docx", "To trinh.pdf"), row(RequestFileCategory.Attachments, "Anh.png")];
    expect(buildArchiveEntries(rows, RequestArchiveKind.Original).map((e) => e.name)).toEqual([
      "Văn bản tờ trình/To trinh.docx",
      "Tài liệu đính kèm/Anh.png",
    ]);
  });

  it("trùng tên (không phân biệt hoa thường) thì thêm (2), (3) trước đuôi", () => {
    const rows = [
      row(RequestFileCategory.Documents, "A.docx", "Hop dong.pdf"),
      row(RequestFileCategory.Documents, "B.docx", "hop dong.pdf"),
      row(RequestFileCategory.Documents, "C.docx", "Hop dong.pdf"),
    ];
    expect(buildArchiveEntries(rows, RequestArchiveKind.Signed).map((e) => e.name)).toEqual([
      "Hop dong.pdf",
      "hop dong (2).pdf",
      "Hop dong (3).pdf",
    ]);
  });

  it("không cho ký tự đường dẫn trong tên tệp lọt ra ngoài thư mục", () => {
    const rows = [row(RequestFileCategory.Attachments, "../../etc\\passwd.txt")];
    expect(buildArchiveEntries(rows, RequestArchiveKind.Original)[0].name).toBe("Tài liệu đính kèm/.._.._etc_passwd.txt");
  });
});

describe("archiveFilename", () => {
  it("mã tờ trình + loại, chỉ ký tự an toàn", () => {
    expect(archiveFilename("ESIGN-2026-0002", RequestArchiveKind.Signed)).toBe("ESIGN-2026-0002-ban-ky-so.zip");
    expect(archiveFilename(undefined, RequestArchiveKind.Original)).toBe("to-trinh-tep-goc.zip");
    expect(archiveFilename("A/B C", RequestArchiveKind.Original)).toBe("A_B_C-tep-goc.zip");
  });
});
