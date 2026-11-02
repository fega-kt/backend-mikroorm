import { ApprovalHistoryAction } from "../../entities/approval-history";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Một lượt duyệt đã xử lý: thời gian chờ = lúc xử lý − lúc task được giao */
export interface ActedTaskSample {
  requestTypeId: string;
  code: string;
  name: string;
  createdAt: Date;
  actedAt: Date;
}

export interface AvgTimeByType {
  requestTypeId: string;
  code: string;
  name: string;
  days: number;
  count: number;
}

/** Ô "Thời gian duyệt trung bình" ở trang chủ; null khi kỳ đó chưa có lượt xử lý nào (không trả 0 để khỏi hiểu nhầm là nhanh) */
export interface AvgApprovalTimeStats {
  /** Số ngày / bước, tháng này */
  avgDays: number | null;
  /** Tháng này − tháng trước (âm = nhanh hơn); null khi một trong hai tháng chưa có dữ liệu */
  deltaDays: number | null;
  byType: AvgTimeByType[];
}

/** Số hiển thị của ô: làm tròn 1 chữ số thập phân */
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Số ngày (lịch) từ lúc giao task tới lúc xử lý; không âm khi đồng hồ lệch */
const waitingDays = (task: ActedTaskSample) => Math.max(0, (task.actedAt.getTime() - task.createdAt.getTime()) / DAY_MS);

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/**
 * Thời gian duyệt trung bình tháng này (tổng và theo loại tờ trình, loại nhiều lượt nhất trước, tối đa `limit` loại)
 * và chênh lệch so với tháng trước. Trung bình tổng tính trên mọi lượt, không phải trung bình của các trung bình theo loại.
 */
export function buildAvgApprovalTime(thisMonth: ActedTaskSample[], lastMonth: ActedTaskSample[], limit = 4): AvgApprovalTimeStats {
  const avg = mean(thisMonth.map(waitingDays));
  const previous = mean(lastMonth.map(waitingDays));

  const groups = new Map<string, { code: string; name: string; days: number[] }>();
  for (const task of thisMonth) {
    const group = groups.get(task.requestTypeId) ?? { code: task.code, name: task.name, days: [] };
    group.days.push(waitingDays(task));
    groups.set(task.requestTypeId, group);
  }
  const byType = [...groups]
    .map(([requestTypeId, group]) => ({
      requestTypeId,
      code: group.code,
      name: group.name,
      days: round1(mean(group.days) ?? 0),
      count: group.days.length,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);

  return {
    avgDays: avg === null ? null : round1(avg),
    deltaDays: avg === null || previous === null ? null : round1(avg - previous),
    byType,
  };
}

export type ActivityKind = "approved" | "rejected" | "returned" | "submitted" | "reassigned";

/** Các hành động của lịch sử hiện ở khối "Hoạt động phê duyệt" */
export const ACTIVITY_ACTIONS = [
  ApprovalHistoryAction.Submit,
  ApprovalHistoryAction.Resubmit,
  ApprovalHistoryAction.Approve,
  ApprovalHistoryAction.AutoApprove,
  ApprovalHistoryAction.Reject,
  ApprovalHistoryAction.AutoReject,
  ApprovalHistoryAction.Return,
  ApprovalHistoryAction.Delegate,
];

/**
 * Hành động lịch sử → loại hoạt động của giao diện; null = không hiện.
 * Delegate trong lịch sử là gán lại / chia lại task (không phải tạo ủy quyền): chỉ lấy gán lại do người dùng làm,
 * bỏ lần hệ thống tự chia lại task nhóm.
 */
export function activityKind(action: ApprovalHistoryAction, data?: Record<string, unknown> | null): ActivityKind | null {
  switch (action) {
    case ApprovalHistoryAction.Submit:
    case ApprovalHistoryAction.Resubmit:
      return "submitted";
    case ApprovalHistoryAction.Approve:
    case ApprovalHistoryAction.AutoApprove:
      return "approved";
    case ApprovalHistoryAction.Reject:
    case ApprovalHistoryAction.AutoReject:
      return "rejected";
    case ApprovalHistoryAction.Return:
      return "returned";
    case ApprovalHistoryAction.Delegate:
      return data?.reason === "reassign" ? "reassigned" : null;
    default:
      return null;
  }
}
