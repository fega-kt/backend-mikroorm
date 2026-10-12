import { ApprovalPriority } from "../../entities/approval-request/approval-request.entity";
import { FormFieldType, type FormSchema } from "../approval-engine/form-schema";

const PRIORITY_LABEL: Record<ApprovalPriority, string> = {
  [ApprovalPriority.Low]: "Thấp",
  [ApprovalPriority.Normal]: "Bình thường",
  [ApprovalPriority.High]: "Cao",
  [ApprovalPriority.Urgent]: "Khẩn",
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
};

/** Giá trị trường form để chèn vào email (ngày dd/mm/yyyy, lựa chọn → nhãn, có/không…) */
export function formatPayloadField(type: FormFieldType | undefined, value: unknown, options?: { label: string; value: string }[]): string {
  if (value === undefined || value === null || value === "") return "";
  switch (type) {
    case FormFieldType.Date:
      return formatDate(String(value));
    case FormFieldType.DateRange:
      return Array.isArray(value) ? value.map((v) => formatDate(String(v))).join(" → ") : String(value);
    case FormFieldType.Money:
      return typeof value === "number" ? value.toLocaleString("vi-VN") : String(value);
    case FormFieldType.Select:
      return options?.find((o) => o.value === value)?.label ?? String(value);
    case FormFieldType.Switch:
      return value ? "Có" : "Không";
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

export interface RequestVariableInput {
  code?: string;
  title: string;
  typeName?: string;
  formSchema?: FormSchema;
  payload?: Record<string, unknown>;
  requesterName?: string;
  departmentName?: string;
  priority?: ApprovalPriority;
  link: string;
  stepName?: string;
  actorName?: string;
  comment?: string;
  message?: string;
}

/** Biến của mẫu (trừ recipient.name — thêm theo từng người nhận khi gửi) */
export function buildRequestVariables(input: RequestVariableInput): Record<string, string> {
  const vars: Record<string, string> = {
    "request.code": input.code ?? "",
    "request.title": input.title,
    "request.type": input.typeName ?? "",
    "request.requester": input.requesterName ?? "",
    "request.department": input.departmentName ?? "",
    "request.priority": input.priority !== undefined ? PRIORITY_LABEL[input.priority] : "",
    "request.link": input.link,
    "step.name": input.stepName ?? "",
    "actor.name": input.actorName ?? "",
    comment: input.comment ?? "",
    message: input.message ?? "",
  };
  const fields = new Map((input.formSchema ?? []).map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(input.payload ?? {})) {
    const field = fields.get(key);
    vars[`payload.${key}`] = formatPayloadField(field?.type, value, field?.options);
  }
  return vars;
}
