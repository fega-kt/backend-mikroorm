import { describe, expect, it } from "vitest";
import { AttachmentPreviewStatus } from "../../entities/attachment";
import { PDF_PREVIEW_MAX_ATTEMPTS, PDF_PREVIEW_RETRY_DELAY_MINUTES, pdfPreviewDueFilter } from "./attachment-preview.service";

describe("pdfPreviewDueFilter", () => {
  it("chỉ lấy tệp pending đã chờ đủ lâu theo số lần lỗi", () => {
    const now = Date.UTC(2026, 9, 17, 12, 0, 0);
    const filter = pdfPreviewDueFilter(now) as {
      $and: [unknown, { previewStatus: string; $or: { previewAttempts: number; updatedAt: { $lt: Date } }[] }];
    };
    const due = filter.$and[1];

    expect(due.previewStatus).toBe(AttachmentPreviewStatus.Pending);
    expect(due.$or.map((item) => item.previewAttempts)).toEqual([0, 1, 2]);
    expect(due.$or.map((item) => (now - item.updatedAt.$lt.getTime()) / 60000)).toEqual([15, 15, 60]);
  });

  it("mỗi lần thử còn lại đều có thời gian chờ (lần lỗi cuối chuyển failed, không cần chờ)", () => {
    expect(PDF_PREVIEW_RETRY_DELAY_MINUTES).toHaveLength(PDF_PREVIEW_MAX_ATTEMPTS);
  });
});
