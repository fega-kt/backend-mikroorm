import { describe, expect, it } from "vitest";
import { buildRequestFileFolder, buildSignedFileFolder, isRequestFileKey, RequestFileCategory } from "./request-file.constants";

const ID = "c0fc4cde-8945-4dac-9123-65981abfd69c";

describe("request file paths", () => {
  it("thêm yyyyMM/dd theo giờ Việt Nam vào thư mục tệp", () => {
    // 2026-10-18 20:00 UTC = 19/10/2026 03:00 giờ Việt Nam
    const createdAt = new Date("2026-10-18T20:00:00Z");
    expect(buildRequestFileFolder(ID, 2, RequestFileCategory.Documents, createdAt)).toBe(`Attachments/202610/19/${ID}/round-2/documents`);
    expect(buildSignedFileFolder(ID, 1, createdAt)).toBe(`Attachments/202610/19/${ID}/round-1/signed`);
  });

  it("ngày và tháng luôn có số 0 đứng đầu để xếp theo chữ cái đúng thứ tự thời gian", () => {
    expect(buildRequestFileFolder(ID, 1, RequestFileCategory.Attachments, new Date("2026-09-05T05:00:00Z"))).toBe(
      `Attachments/202609/05/${ID}/round-1/attachments`,
    );
  });

  describe("isRequestFileKey", () => {
    const category = RequestFileCategory.Documents;

    it("nhận tệp có ngày ở bất kỳ vòng nào", () => {
      expect(isRequestFileKey(`Attachments/202610/19/${ID}/round-2/documents/a.pdf`, ID, category)).toBe(true);
      expect(isRequestFileKey(`Attachments/202610/20/${ID}/documents/a.pdf`, ID, category)).toBe(true);
    });

    it("vẫn nhận tệp của tờ trình cũ chưa có ngày", () => {
      expect(isRequestFileKey(`Attachments/${ID}/round-1/documents/a.pdf`, ID, category)).toBe(true);
      expect(isRequestFileKey(`Attachments/${ID}/documents/a.pdf`, ID, category)).toBe(true);
    });

    it("từ chối tệp của phiếu khác, loại tệp khác hoặc đường dẫn lạ", () => {
      expect(isRequestFileKey(`Attachments/202610/19/other-id/round-1/documents/a.pdf`, ID, category)).toBe(false);
      expect(isRequestFileKey(`Attachments/202610/19/${ID}/round-1/attachments/a.pdf`, ID, category)).toBe(false);
      expect(isRequestFileKey(`Attachments/2026/19/${ID}/round-1/documents/a.pdf`, ID, category)).toBe(false);
      expect(isRequestFileKey(`Attachments/202610/19/${ID}/round-1/documents/x/a.pdf`, ID, category)).toBe(false);
      expect(isRequestFileKey(`Other/${ID}/round-1/documents/a.pdf`, ID, category)).toBe(false);
    });
  });
});
