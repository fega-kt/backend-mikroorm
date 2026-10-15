import { BRAND_TEMPLATE_VARIABLES } from "@core-service/services/email-template/core-email.templates";
import { type TemplateVariable, toSampleVariables } from "@core-service/services/email-template/email-template.render";

export { renderEmail, renderTemplate, usedVariables } from "@core-service/services/email-template/email-template.render";
export type { TemplateVariable } from "@core-service/services/email-template/email-template.render";

/** Biến chung của mọi mẫu tờ trình (ngoài ra có payload.<mã trường> theo form của loại tờ trình) */
export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: "recipient.name", sample: "Nguyễn Văn A" },
  { key: "request.code", sample: "NP-2026-0012" },
  { key: "request.title", sample: "Nghỉ phép năm 20/10 – 22/10" },
  { key: "request.type", sample: "Tờ trình nghỉ phép" },
  { key: "request.requester", sample: "Trần Thị B" },
  { key: "request.department", sample: "Phòng Phát triển" },
  { key: "request.priority", sample: "Bình thường" },
  { key: "request.link", sample: "https://app.example.com/approval/requests/123" },
  { key: "step.name", sample: "Trưởng phòng" },
  { key: "actor.name", sample: "Lê Văn C" },
  { key: "comment", sample: "Đồng ý, lưu ý bàn giao công việc trước khi nghỉ." },
  { key: "message", sample: "Tờ trình đã được trưởng phòng duyệt." },
  ...BRAND_TEMPLATE_VARIABLES,
];

export const sampleVariables = (): Record<string, string> => toSampleVariables(TEMPLATE_VARIABLES);
