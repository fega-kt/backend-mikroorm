import { describe, expect, it } from "vitest";
import { ApprovalHistoryAction } from "../../entities/approval-history";
import { activityKind, buildAvgApprovalTime, type ActedTaskSample } from "./dashboard-stats";

const at = (day: number, hour = 0) => new Date(Date.UTC(2026, 10, day, hour));
const task = (typeId: string, name: string, assigned: Date, acted: Date): ActedTaskSample => ({
  requestTypeId: typeId,
  code: typeId.toUpperCase(),
  name,
  createdAt: assigned,
  actedAt: acted,
});

describe("buildAvgApprovalTime", () => {
  it("returns nulls and no types when nothing was handled", () => {
    expect(buildAvgApprovalTime([], [])).toEqual({ avgDays: null, deltaDays: null, byType: [] });
  });

  it("averages over every task, not over the per-type averages", () => {
    // leave: 1 ngày, 1 ngày, 1 ngày; purchase: 5 ngày → trung bình tổng (1+1+1+5)/4 = 2, không phải (1+5)/2 = 3
    const thisMonth = [
      task("leave", "Nghỉ phép", at(1), at(2)),
      task("leave", "Nghỉ phép", at(2), at(3)),
      task("leave", "Nghỉ phép", at(3), at(4)),
      task("purchase", "Mua sắm", at(1), at(6)),
    ];
    const result = buildAvgApprovalTime(thisMonth, []);
    expect(result.avgDays).toBe(2);
    expect(result.byType).toEqual([
      { requestTypeId: "leave", code: "LEAVE", name: "Nghỉ phép", days: 1, count: 3 },
      { requestTypeId: "purchase", code: "PURCHASE", name: "Mua sắm", days: 5, count: 1 },
    ]);
  });

  it("reports a negative delta when faster than last month and null delta without a previous month", () => {
    const fast = [task("leave", "Nghỉ phép", at(1), at(2))];
    const slow = [task("leave", "Nghỉ phép", at(1), at(4))];
    expect(buildAvgApprovalTime(fast, slow).deltaDays).toBe(-2);
    expect(buildAvgApprovalTime(slow, fast).deltaDays).toBe(2);
    expect(buildAvgApprovalTime(fast, []).deltaDays).toBeNull();
    expect(buildAvgApprovalTime([], fast).deltaDays).toBeNull();
  });

  it("rounds to one decimal and ignores negative waiting times", () => {
    // 0,25 ngày → 0,3; thời gian âm (đồng hồ lệch) tính là 0
    const result = buildAvgApprovalTime([task("a", "A", at(1), at(1, 6)), task("b", "B", at(2), at(1))], []);
    expect(result.byType.map((item) => item.days).sort()).toEqual([0, 0.3]);
  });

  it("keeps only the busiest types, ties broken by name", () => {
    const thisMonth = ["e", "d", "c", "b", "a"].flatMap((id, index) =>
      Array.from({ length: index === 4 ? 1 : 2 }, () => task(id, id.toUpperCase(), at(1), at(2))),
    );
    expect(buildAvgApprovalTime(thisMonth, [], 3).byType.map((item) => item.name)).toEqual(["B", "C", "D"]);
  });
});

describe("activityKind", () => {
  it("maps decisions and submissions", () => {
    expect(activityKind(ApprovalHistoryAction.Submit)).toBe("submitted");
    expect(activityKind(ApprovalHistoryAction.Resubmit)).toBe("submitted");
    expect(activityKind(ApprovalHistoryAction.Approve)).toBe("approved");
    expect(activityKind(ApprovalHistoryAction.AutoApprove)).toBe("approved");
    expect(activityKind(ApprovalHistoryAction.Reject)).toBe("rejected");
    expect(activityKind(ApprovalHistoryAction.AutoReject)).toBe("rejected");
    expect(activityKind(ApprovalHistoryAction.Return)).toBe("returned");
  });

  it("only keeps user reassignments from Delegate, not the system redistributing group tasks", () => {
    expect(activityKind(ApprovalHistoryAction.Delegate, { reason: "reassign" })).toBe("reassigned");
    expect(activityKind(ApprovalHistoryAction.Delegate, { reason: "regroup" })).toBeNull();
    expect(activityKind(ApprovalHistoryAction.Delegate)).toBeNull();
  });

  it("ignores everything else", () => {
    expect(activityKind(ApprovalHistoryAction.Remind)).toBeNull();
    expect(activityKind(ApprovalHistoryAction.Update)).toBeNull();
    expect(activityKind(ApprovalHistoryAction.Sign)).toBeNull();
  });
});
