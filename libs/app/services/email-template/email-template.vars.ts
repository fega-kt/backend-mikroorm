import { escapeHtml } from "@core-service/services/email-template/email-template.render";
import { ApprovalPriority } from "../../entities/approval-request/approval-request.entity";
import { FormFieldType, type FormSchema } from "../approval-engine/form-schema";

/** Kiểu cụm @mention trong email (inline vì mail client không đọc được CSS ngoài) */
const MENTION_STYLE = "color:#1458d6;background:#e8f0fe;border-radius:4px;padding:1px 4px;font-weight:600";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Nội dung bình luận dạng HTML cho email: escape chữ của người dùng, tô nổi "@Họ tên" của những người được nhắc
 * (tên dài khớp trước), xuống dòng thành <br>. Dùng cho biến `comment.html`.
 */
export function highlightMentions(text: string, names: string[]): string {
  const escaped = escapeHtml(text);
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const highlighted = unique.length
    ? escaped.replace(
        new RegExp(unique.map((name) => `@${escapeRegExp(escapeHtml(name))}`).join("|"), "g"),
        (mention) => `<span style="${MENTION_STYLE}">${mention}</span>`,
      )
    : escaped;
  return highlighted.replace(/\r?\n/g, "<br>");
}

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
    case FormFieldType.User:
    case FormFieldType.Department:
    case FormFieldType.Principal:
      return (Array.isArray(value) ? value : [value])
        .map((v) => (v as { name?: string })?.name ?? "")
        .filter(Boolean)
        .join(", ");
    // Bảng: tạm thời chỉ báo số dòng (bảng HTML trong email làm sau)
    case FormFieldType.Table:
      return Array.isArray(value) ? `${value.length} dòng` : "";
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

/**
 * Tên người thực hiện ({{actor.name}}) khi việc do hệ thống làm (tự động duyệt / từ chối do quá hạn…):
 * lịch sử ghi actor = null, FE hiện "Hệ thống" — email dùng cùng chữ này
 */
export const SYSTEM_ACTOR_NAME = "Hệ thống";

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
  /** Họ tên những người được nhắc trong bình luận (để tô nổi @tên trong `comment.html`) */
  mentionNames?: string[];
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
    "comment.html": highlightMentions(input.comment ?? "", input.mentionNames ?? []),
    message: input.message ?? "",
  };
  const fields = new Map((input.formSchema ?? []).map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(input.payload ?? {})) {
    const field = fields.get(key);
    vars[`payload.${key}`] = formatPayloadField(field?.type, value, field?.options);
  }
  return vars;
}
