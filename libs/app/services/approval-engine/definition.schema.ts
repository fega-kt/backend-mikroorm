import { z } from "zod";

/** Cách xác định người duyệt của một bước */
export enum ApproverType {
  /** Trưởng phòng của người tạo đơn (người tạo là trưởng phòng → trưởng phòng cấp cha) */
  DeptHead = "DEPT_HEAD",
  /** Phó phòng của người tạo đơn (không có phó phòng → trưởng phòng) */
  DeptDeputy = "DEPT_DEPUTY",
  /** Người cụ thể (cũ — giữ để đọc định nghĩa đã lưu; màn thiết kế mới dùng PRINCIPAL) */
  SpecificUser = "SPECIFIC_USER",
  /** Người dùng hoặc nhóm (principal). Nhóm: mọi thành viên nhận task, một người duyệt là đủ */
  Principal = "PRINCIPAL",
}

export enum OverdueAction {
  Remind = "REMIND",
  RemindThenEscalate = "REMIND_THEN_ESCALATE",
  AutoApprove = "AUTO_APPROVE",
  /** Quá hạn: nhắc trước, vẫn trễ thêm một chu kỳ SLA thì hệ thống từ chối tờ trình (lý do: quá hạn xử lý) */
  AutoReject = "AUTO_REJECT",
}

/** Người duyệt là nhóm: cả nhóm cùng xử lý, hay hệ thống chia cho một thành viên */
export enum GroupMode {
  /** Task giao cho cả nhóm — thành viên hiện tại nào cũng xử lý được, ai trước xong trước */
  Shared = "shared",
  /** Hệ thống chọn ngẫu nhiên một thành viên — chỉ người đó (và người họ ủy quyền) xử lý */
  Assign = "assign",
}

export enum ParallelMode {
  /** Tất cả cùng duyệt */
  All = "ALL",
  /** Một người duyệt là đủ */
  Any = "ANY",
}

export enum NotifyChannel {
  Email = "EMAIL",
  InApp = "IN_APP",
}

export enum NodeType {
  Start = "start",
  Approval = "approval",
  Condition = "condition",
  Parallel = "parallel",
  Notify = "notify",
  End = "end",
}

export const approverSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(ApproverType.DeptHead) }),
  z.object({ type: z.literal(ApproverType.DeptDeputy) }),
  z.object({ type: z.literal(ApproverType.SpecificUser), userId: z.string().min(1) }),
  z.object({ type: z.literal(ApproverType.Principal), principalId: z.string().min(1) }),
]);

export const stepOptionsSchema = z.object({
  allowDelegation: z.boolean().default(true),
  skipIfRequester: z.boolean().default(false),
  /** Không tìm được người duyệt (phòng thiếu trưởng/phó, nhóm trống…) thì bỏ qua thay vì báo lỗi */
  skipIfNoApprover: z.boolean().default(false),
  requireRejectReason: z.boolean().default(true),
  allowReturn: z.boolean().default(true),
  /** Người duyệt là nhóm: cùng xử lý / chia cho một người */
  groupMode: z.enum(GroupMode).default(GroupMode.Shared),
  /** Nhóm "cùng xử lý": gửi email cho cả nhóm khi task tới (mặc định chỉ thông báo trong ứng dụng) */
  emailGroup: z.boolean().default(false),
});

/**
 * Thông báo khi một bước duyệt xong / bị từ chối / bị trả lại.
 * Từ chối, trả lại chưa cấu hình → gửi người trình như cũ; duyệt xong chưa cấu hình → không gửi.
 */
export const stepNotifyRuleSchema = z.object({
  enabled: z.boolean().default(true),
  channels: z.array(z.enum(NotifyChannel)).min(1).default([NotifyChannel.InApp, NotifyChannel.Email]),
  notifyRequester: z.boolean().default(true),
  /** Duyệt xong: người được giao duyệt ở bước kế tiếp */
  notifyNextApprovers: z.boolean().default(false),
  /** Từ chối / trả lại: những người đã duyệt trước đó trong lượt trình này */
  notifyPreviousApprovers: z.boolean().default(false),
  /** Người nhận cố định (người dùng / nhóm) */
  recipients: z.array(approverSchema).default([]),
  /** Mã mẫu email (bỏ trống → mẫu hệ thống của sự kiện) */
  emailTemplate: z.string().max(100).optional(),
  message: z.string().max(1000).optional(),
});

export const stepNotificationsSchema = z.object({
  approved: stepNotifyRuleSchema.optional(),
  rejected: stepNotifyRuleSchema.optional(),
  returned: stepNotifyRuleSchema.optional(),
});

const nodeBase = {
  id: z.string().min(1).max(64),
  name: z.string().trim().max(255).optional(),
};

const slaFields = {
  slaHours: z
    .number()
    .positive()
    .max(24 * 365)
    .optional(),
  onOverdue: z.enum(OverdueAction).default(OverdueAction.Remind),
  options: stepOptionsSchema.default(stepOptionsSchema.parse({})),
  notifications: stepNotificationsSchema.default({}),
};

export const startNodeSchema = z.object({ ...nodeBase, type: z.literal(NodeType.Start) });

export const approvalNodeSchema = z.object({
  ...nodeBase,
  type: z.literal(NodeType.Approval),
  /** null khi admin chưa chọn — chỉ hợp lệ ở bản nháp, validate-graph sẽ báo lỗi */
  approver: approverSchema.nullable(),
  ...slaFields,
});

export const conditionNodeSchema = z.object({ ...nodeBase, type: z.literal(NodeType.Condition) });

export const parallelNodeSchema = z.object({
  ...nodeBase,
  type: z.literal(NodeType.Parallel),
  mode: z.enum(ParallelMode).default(ParallelMode.All),
  approvers: z.array(approverSchema).default([]),
  ...slaFields,
});

export const notifyNodeSchema = z.object({
  ...nodeBase,
  type: z.literal(NodeType.Notify),
  channels: z.array(z.enum(NotifyChannel)).min(1).default([NotifyChannel.InApp]),
  /** Gửi cho người trình. Bỏ trống (định nghĩa cũ) → gửi khi không có người nhận nào khác */
  notifyRequester: z.boolean().optional(),
  /** Gửi cho người được giao duyệt ở bước duyệt kế tiếp (không có nếu sau đó là kết thúc) */
  notifyNextApprovers: z.boolean().default(false),
  /** Người nhận cố định (người dùng / nhóm) */
  recipients: z.array(approverSchema).default([]),
  /** Mã mẫu email (bỏ trống → mẫu mặc định approval.notify) */
  emailTemplate: z.string().max(100).optional(),
  message: z.string().max(1000).optional(),
});

export const endNodeSchema = z.object({ ...nodeBase, type: z.literal(NodeType.End) });

export const nodeSchema = z.discriminatedUnion("type", [
  startNodeSchema,
  approvalNodeSchema,
  conditionNodeSchema,
  parallelNodeSchema,
  notifyNodeSchema,
  endNodeSchema,
]);

/** Biểu thức json-logic, ví dụ { ">": [{ "var": "payload.days" }, 3] } */
export const jsonLogicSchema = z.record(z.string(), z.unknown());

export const edgeSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().max(100).optional(),
  condition: jsonLogicSchema.optional(),
  default: z.boolean().optional(),
});

export const workflowDefinitionSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  /** Vị trí node trên canvas — engine không dùng */
  layout: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
});

export type Approver = z.infer<typeof approverSchema>;
export type StepOptions = z.infer<typeof stepOptionsSchema>;
export type StepNotifyRule = z.infer<typeof stepNotifyRuleSchema>;
export type WorkflowNode = z.infer<typeof nodeSchema>;
export type ApprovalNode = z.infer<typeof approvalNodeSchema>;
export type ParallelNode = z.infer<typeof parallelNodeSchema>;
export type NotifyNode = z.infer<typeof notifyNodeSchema>;
export type WorkflowEdge = z.infer<typeof edgeSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
/** Node mà engine dừng lại chờ người duyệt */
export type WaitNode = ApprovalNode | ParallelNode;

/** Bước thông báo có gửi cho người trình không (tương thích định nghĩa cũ chưa có cờ) */
export const notifiesRequester = (node: NotifyNode) => node.notifyRequester ?? (node.recipients.length === 0 && !node.notifyNextApprovers);

export type StepEvent = keyof z.infer<typeof stepNotificationsSchema>;

/** Quy tắc thông báo của bước có ít nhất một người nhận (cờ không áp dụng cho sự kiện thì bỏ qua) */
export const hasStepNotifyRecipient = (rule: StepNotifyRule, event: StepEvent) =>
  rule.notifyRequester || rule.recipients.length > 0 || (event === "approved" ? rule.notifyNextApprovers : rule.notifyPreviousApprovers);

export const isWaitNode = (node: WorkflowNode): node is WaitNode => node.type === NodeType.Approval || node.type === NodeType.Parallel;
