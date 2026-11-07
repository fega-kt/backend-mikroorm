import { describe, expect, it } from "vitest";
import { ApprovalPriority, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalTaskStatus } from "../../entities/approval-task";
import { EXPORT_LANGS } from "@core-service/services/export/export.util";
import {
  EXPORT_TITLES,
  INBOX_EXPORT_COLUMNS,
  REQUEST_EXPORT_COLUMNS,
  type InboxExportRow,
  type RequestExportRow,
} from "./approval-export.columns";

const request: RequestExportRow = {
  id: "r1",
  code: "EQR-2026-0009",
  title: "Mua thiết bị mới",
  status: ApprovalRequestStatus.Pending,
  priority: ApprovalPriority.Urgent,
  requestTypeName: "Đề nghị mua sắm",
  categoryName: "IT",
  requesterName: "Kim Thái",
  departmentName: "zhizhu",
  submittedAt: new Date("2026-11-05T02:00:00Z"),
  closedAt: null,
  createdAt: new Date("2026-11-05T01:00:00Z"),
  updatedAt: new Date("2026-11-05T03:00:00Z"),
};

const byKey = <T>(columns: { key: string; value: (row: T, lang: "vi-VN" | "en-US" | "zh-CN") => unknown }[], key: string) => {
  const column = columns.find((c) => c.key === key);
  if (!column) throw new Error(key);
  return column;
};

describe("approval export columns", () => {
  it("has a header in every language and unique keys", () => {
    for (const columns of [REQUEST_EXPORT_COLUMNS, INBOX_EXPORT_COLUMNS]) {
      expect(new Set(columns.map((c) => c.key)).size).toBe(columns.length);
      for (const column of columns) {
        for (const lang of EXPORT_LANGS) expect(column.header[lang].length).toBeGreaterThan(0);
      }
    }
    for (const title of Object.values(EXPORT_TITLES)) {
      for (const lang of EXPORT_LANGS) expect(title[lang].length).toBeGreaterThan(0);
    }
  });

  it("translates status and priority labels per language", () => {
    expect(byKey(REQUEST_EXPORT_COLUMNS, "status").value(request, "vi-VN")).toBe("Chờ duyệt");
    expect(byKey(REQUEST_EXPORT_COLUMNS, "status").value(request, "en-US")).toBe("Pending");
    expect(byKey(REQUEST_EXPORT_COLUMNS, "priority").value(request, "vi-VN")).toBe("Khẩn");
    expect(byKey(REQUEST_EXPORT_COLUMNS, "priority").value(request, "zh-CN")).toBe("紧急");
  });

  it("prints an unknown enum value as is instead of leaving the cell empty", () => {
    const odd = { ...request, status: "archived" as ApprovalRequestStatus };
    expect(byKey(REQUEST_EXPORT_COLUMNS, "status").value(odd, "vi-VN")).toBe("archived");
  });

  it("reads inbox columns from the task and its request", () => {
    const task: InboxExportRow = {
      id: "t1",
      taskStatus: ApprovalTaskStatus.Approved,
      nodeName: "Trưởng phòng",
      approverName: "An",
      originApproverName: "Bình",
      dueAt: null,
      actedAt: new Date("2026-11-06T00:00:00Z"),
      comment: "OK",
      createdAt: new Date("2026-11-05T05:00:00Z"),
      request,
    };
    expect(byKey(INBOX_EXPORT_COLUMNS, "code").value(task, "vi-VN")).toBe("EQR-2026-0009");
    expect(byKey(INBOX_EXPORT_COLUMNS, "taskStatus").value(task, "vi-VN")).toBe("Đã duyệt");
    expect(byKey(INBOX_EXPORT_COLUMNS, "requestStatus").value(task, "en-US")).toBe("Pending");
    expect(byKey(INBOX_EXPORT_COLUMNS, "step").value(task, "vi-VN")).toBe("Trưởng phòng");
    expect(byKey(INBOX_EXPORT_COLUMNS, "approver").value(task, "vi-VN")).toBe("An");
  });
});
