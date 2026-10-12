import { workflowDefinitionSchema, type WorkflowDefinition } from "../definition.schema";

/** Quy trình nghỉ phép theo mockup: QL trực tiếp → (> 3 ngày: GĐ khối) → duyệt song song → kết thúc */
export const leaveWorkflow = (): WorkflowDefinition =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: "start" },
      { id: "n1", type: "approval", name: "Trưởng phòng", approver: { type: "DEPT_HEAD" }, slaHours: 24 },
      { id: "c1", type: "condition", name: "Số ngày nghỉ > 3?" },
      {
        id: "n2",
        type: "approval",
        name: "Giám đốc khối",
        approver: { type: "SPECIFIC_USER", userId: "director" },
        slaHours: 48,
        onOverdue: "REMIND_THEN_ESCALATE",
        options: { allowDelegation: true, skipIfRequester: true, requireRejectReason: true },
      },
      { id: "notify1", type: "notify", name: "Báo HR", channels: ["EMAIL"] },
      {
        id: "p1",
        type: "parallel",
        mode: "ALL",
        approvers: [
          { type: "SPECIFIC_USER", userId: "hr" },
          { type: "SPECIFIC_USER", userId: "admin_office" },
        ],
        slaHours: 24,
      },
      { id: "end", type: "end" },
    ],
    edges: [
      { from: "start", to: "n1" },
      { from: "n1", to: "c1" },
      { from: "c1", to: "n2", label: "Có", condition: { ">": [{ var: "payload.days" }, 3] } },
      { from: "c1", to: "notify1", label: "Không", default: true },
      { from: "n2", to: "notify1" },
      { from: "notify1", to: "p1" },
      { from: "p1", to: "end" },
    ],
  });
