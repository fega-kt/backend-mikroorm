/**
 * Mẫu email: biến dạng {{tên.biến}} thay bằng dữ liệu tờ trình khi gửi. Hàm thuần — dùng chung cho app (xem trước)
 * và app-jobs (gửi email).
 */

export interface TemplateVariable {
  key: string;
  /** Giá trị mẫu khi xem trước */
  sample: string;
}

/** Biến chung của mọi mẫu (ngoài ra có payload.<mã trường> theo form của loại tờ trình) */
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
];

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const VARIABLE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Thay {{biến}} bằng giá trị. `html: true` (nội dung email) thì escape giá trị để dữ liệu người dùng nhập
 * không chèn được HTML. Biến không có giá trị → chuỗi rỗng.
 */
export function renderTemplate(text: string, vars: Record<string, string | undefined>, options: { html: boolean }) {
  return text.replace(VARIABLE_PATTERN, (_, key: string) => {
    const value = vars[key] ?? "";
    return options.html ? escapeHtml(value) : value;
  });
}

/** Các biến được dùng trong một chuỗi (để cảnh báo biến không tồn tại) */
export function usedVariables(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE_PATTERN)].map((m) => m[1]))];
}

export const sampleVariables = (): Record<string, string> => Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.sample]));

/** Khung HTML chung bọc nội dung mẫu */
export function wrapEmailHtml(bodyHtml: string, link?: string, linkLabel = "Xem tờ trình") {
  const button = link
    ? `<p style="margin-top:20px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:9px 18px;background:#1458d6;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(linkLabel)}</a></p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1d2129;max-width:640px">${bodyHtml}${button}</div>`;
}
