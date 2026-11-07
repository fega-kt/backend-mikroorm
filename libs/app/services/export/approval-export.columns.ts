import type { ExportColumn, ExportLang } from "@core-service/services/export/export.util";
import { ApprovalPriority, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalTaskStatus } from "../../entities/approval-task";

type Labeled = Record<ExportLang, string>;

const label = (vi: string, en: string, zh: string): Labeled => ({ "vi-VN": vi, "en-US": en, "zh-CN": zh });

const REQUEST_STATUS_LABEL: Record<ApprovalRequestStatus, Labeled> = {
  [ApprovalRequestStatus.Draft]: label("Đang soạn", "Draft", "草稿"),
  [ApprovalRequestStatus.Pending]: label("Chờ duyệt", "Pending", "待审批"),
  [ApprovalRequestStatus.Approved]: label("Đã duyệt", "Approved", "已批准"),
  [ApprovalRequestStatus.Rejected]: label("Từ chối", "Rejected", "已拒绝"),
  [ApprovalRequestStatus.Returned]: label("Trả lại", "Returned", "已退回"),
  [ApprovalRequestStatus.Cancelled]: label("Đã hủy", "Cancelled", "已取消"),
};

const PRIORITY_LABEL: Record<ApprovalPriority, Labeled> = {
  [ApprovalPriority.Low]: label("Thấp", "Low", "低"),
  [ApprovalPriority.Normal]: label("Bình thường", "Normal", "普通"),
  [ApprovalPriority.High]: label("Cao", "High", "高"),
  [ApprovalPriority.Urgent]: label("Khẩn", "Urgent", "紧急"),
};

const TASK_STATUS_LABEL: Record<ApprovalTaskStatus, Labeled> = {
  [ApprovalTaskStatus.Pending]: label("Chờ duyệt", "Pending", "待处理"),
  [ApprovalTaskStatus.Approved]: label("Đã duyệt", "Approved", "已批准"),
  [ApprovalTaskStatus.Rejected]: label("Từ chối", "Rejected", "已拒绝"),
  [ApprovalTaskStatus.Returned]: label("Trả lại", "Returned", "已退回"),
  [ApprovalTaskStatus.Skipped]: label("Bỏ qua", "Skipped", "已跳过"),
};

/** Nhãn theo ngôn ngữ; giá trị lạ (dữ liệu cũ / enum mới) in nguyên giá trị thay vì để trống */
const pick = <K extends string | number>(map: Record<K, Labeled>, key: K | null | undefined, lang: ExportLang) =>
  key === null || key === undefined ? null : (map[key]?.[lang] ?? String(key));

/** Một tờ trình như dòng của file xuất — chỉ chứa giá trị đã lấy ra khỏi entity */
export interface RequestExportRow {
  id: string;
  code?: string | null;
  title: string;
  status: ApprovalRequestStatus;
  priority: ApprovalPriority;
  requestTypeName?: string | null;
  categoryName?: string | null;
  requesterName?: string | null;
  departmentName?: string | null;
  submittedAt?: Date | null;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Một lượt duyệt (task) của hộp chờ duyệt, kèm tờ trình của nó */
export interface InboxExportRow {
  id: string;
  taskStatus: ApprovalTaskStatus;
  nodeName?: string | null;
  approverName?: string | null;
  originApproverName?: string | null;
  dueAt?: Date | null;
  actedAt?: Date | null;
  comment?: string | null;
  createdAt: Date;
  request: Pick<
    RequestExportRow,
    "code" | "title" | "status" | "priority" | "requestTypeName" | "requesterName" | "departmentName" | "submittedAt"
  >;
}

export const REQUEST_EXPORT_COLUMNS: ExportColumn<RequestExportRow>[] = [
  { key: "code", header: label("Mã tờ trình", "Code", "编号"), width: 18, value: (row) => row.code },
  { key: "title", header: label("Tiêu đề", "Title", "标题"), width: 48, value: (row) => row.title },
  { key: "requestType", header: label("Loại tờ trình", "Request type", "申请类型"), width: 30, value: (row) => row.requestTypeName },
  { key: "category", header: label("Nhóm", "Category", "分类"), width: 24, value: (row) => row.categoryName },
  { key: "requester", header: label("Người trình", "Requester", "申请人"), width: 24, value: (row) => row.requesterName },
  { key: "department", header: label("Đơn vị", "Department", "部门"), width: 24, value: (row) => row.departmentName },
  {
    key: "priority",
    header: label("Độ ưu tiên", "Priority", "优先级"),
    width: 14,
    value: (row, lang) => pick(PRIORITY_LABEL, row.priority, lang),
  },
  {
    key: "status",
    header: label("Trạng thái", "Status", "状态"),
    width: 16,
    value: (row, lang) => pick(REQUEST_STATUS_LABEL, row.status, lang),
  },
  {
    key: "submittedAt",
    header: label("Ngày gửi", "Submitted at", "提交时间"),
    width: 18,
    type: "datetime",
    value: (row) => row.submittedAt,
  },
  { key: "closedAt", header: label("Ngày kết thúc", "Closed at", "结束时间"), width: 18, type: "datetime", value: (row) => row.closedAt },
  { key: "createdAt", header: label("Ngày tạo", "Created at", "创建时间"), width: 18, type: "datetime", value: (row) => row.createdAt },
  { key: "updatedAt", header: label("Cập nhật", "Updated at", "更新时间"), width: 18, type: "datetime", value: (row) => row.updatedAt },
];

export const INBOX_EXPORT_COLUMNS: ExportColumn<InboxExportRow>[] = [
  { key: "code", header: label("Mã tờ trình", "Code", "编号"), width: 18, value: (row) => row.request.code },
  { key: "title", header: label("Tiêu đề", "Title", "标题"), width: 48, value: (row) => row.request.title },
  {
    key: "requestType",
    header: label("Loại tờ trình", "Request type", "申请类型"),
    width: 30,
    value: (row) => row.request.requestTypeName,
  },
  { key: "requester", header: label("Người trình", "Requester", "申请人"), width: 24, value: (row) => row.request.requesterName },
  { key: "department", header: label("Đơn vị", "Department", "部门"), width: 24, value: (row) => row.request.departmentName },
  {
    key: "priority",
    header: label("Độ ưu tiên", "Priority", "优先级"),
    width: 14,
    value: (row, lang) => pick(PRIORITY_LABEL, row.request.priority, lang),
  },
  {
    key: "requestStatus",
    header: label("Trạng thái tờ trình", "Request status", "申请状态"),
    width: 18,
    value: (row, lang) => pick(REQUEST_STATUS_LABEL, row.request.status, lang),
  },
  { key: "step", header: label("Bước duyệt", "Step", "审批步骤"), width: 24, value: (row) => row.nodeName },
  {
    key: "taskStatus",
    header: label("Trạng thái xử lý", "Task status", "处理状态"),
    width: 16,
    value: (row, lang) => pick(TASK_STATUS_LABEL, row.taskStatus, lang),
  },
  { key: "approver", header: label("Người đang giữ", "Holder", "当前处理人"), width: 24, value: (row) => row.approverName },
  {
    key: "originApprover",
    header: label("Người duyệt theo quy trình", "Assigned approver", "流程审批人"),
    width: 26,
    value: (row) => row.originApproverName,
  },
  { key: "comment", header: label("Ý kiến", "Comment", "意见"), width: 40, value: (row) => row.comment },
  { key: "dueAt", header: label("Hạn xử lý", "Due at", "截止时间"), width: 18, type: "datetime", value: (row) => row.dueAt },
  { key: "actedAt", header: label("Ngày xử lý", "Acted at", "处理时间"), width: 18, type: "datetime", value: (row) => row.actedAt },
  {
    key: "submittedAt",
    header: label("Ngày gửi", "Submitted at", "提交时间"),
    width: 18,
    type: "datetime",
    value: (row) => row.request.submittedAt,
  },
  { key: "createdAt", header: label("Ngày giao", "Assigned at", "分配时间"), width: 18, type: "datetime", value: (row) => row.createdAt },
];

/** Tên sheet và tên file (gốc, chưa kèm ngày) theo ngôn ngữ */
export const EXPORT_TITLES = {
  "approval-request-mine": label("Tờ trình của tôi", "My requests", "我的申请"),
  "approval-request-all": label("Tất cả tờ trình", "All requests", "全部申请"),
  "approval-inbox": label("Hộp chờ duyệt", "Approval inbox", "审批收件箱"),
} as const satisfies Record<string, Labeled>;
