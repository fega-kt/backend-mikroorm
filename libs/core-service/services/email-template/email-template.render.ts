import { ENV } from "@config/env.config";

/**
 * Mẫu email: biến dạng {{tên.biến}} thay bằng dữ liệu khi gửi. Hàm thuần — dùng chung cho core (email đăng nhập,
 * mật khẩu…), app (xem trước) và các job gửi email.
 *
 * Nội dung mẫu là toàn bộ email (header, thẻ, footer — HTML dựng bằng bảng + style inline); khi gửi chỉ bọc thêm
 * nền xám (wrapEmailDocument).
 */

export interface TemplateVariable {
  key: string;
  /** Giá trị mẫu khi xem trước */
  sample: string;
}

/** Tiêu đề + nội dung (HTML) của một mẫu */
export interface EmailTemplateBody {
  subject: string;
  body: string;
}

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

export const toSampleVariables = (variables: TemplateVariable[]): Record<string, string> =>
  Object.fromEntries(variables.map((v) => [v.key, v.sample]));

/** Biến có ở mọi email, tự điền khi gửi / xem trước */
export const brandVariables = (): Record<string, string> => ({
  "app.name": ENV.APP_NAME,
  "app.link": ENV.FRONTEND_URL,
  "app.logo": ENV.APP_LOGO_URL,
});

// ===== Dựng nội dung mặc định (chỉ dùng để tạo HTML mặc định của mẫu — admin sửa tự do sau đó) =====

const BRAND = "#1458d6";

const TONES = {
  brand: { fg: BRAND, bg: "#e8f0fe" },
  success: { fg: "#0f9d58", bg: "#e6f4ea" },
  warning: { fg: "#d97706", bg: "#fef3c7" },
  danger: { fg: "#d93025", bg: "#fce8e6" },
} as const;

export type EmailTone = keyof typeof TONES;

/** Các khối quanh đoạn nội dung khi dựng email mặc định; chuỗi chứa được {{biến}} */
export interface EmailLayout {
  tone?: EmailTone;
  /** Emoji / ký tự trong vòng tròn trên tiêu đề */
  icon?: string;
  /** Tiêu đề lớn đầu thẻ */
  title?: string;
  /** Ô nổi bật: mã OTP, mật khẩu mới… (`code`: chữ lớn giãn cách) */
  highlight?: { label: string; value: string; code?: boolean; note?: string };
  button?: { label: string; link: string };
  /** Hộp thông tin dạng nhãn – giá trị */
  details?: { title: string; rows: [string, string][]; note?: string };
}

const table = (attrs: string, rows: string) => `<table role="presentation" cellpadding="0" cellspacing="0" ${attrs}>${rows}</table>`;

const MONO = "font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace";

/**
 * Email đầy đủ (header logo + tên app, thẻ trắng có dải màu, biểu tượng, tiêu đề, nội dung, ô nổi bật, nút,
 * hộp thông tin, footer) dạng HTML còn biến {{...}}. Chữ trong `layout` được escape (biến {{...}} giữ nguyên).
 */
export function buildEmailBody(contentHtml: string, layout: EmailLayout = {}) {
  const tone = TONES[layout.tone ?? "brand"];
  const rows: string[] = [`<tr><td style="height:4px;background:${tone.fg};font-size:0;line-height:0">&nbsp;</td></tr>`];

  const hasHeading = !!(layout.title || layout.icon);
  if (hasHeading) {
    const icon = layout.icon
      ? `<div style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;border-radius:22px;background:${tone.bg};color:${tone.fg};font-size:20px;font-weight:700">${escapeHtml(layout.icon)}</div>` +
        (layout.title ? `<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>` : "")
      : "";
    const title = layout.title ? `<div style="font-size:20px;font-weight:700;color:#1d2129">${escapeHtml(layout.title)}</div>` : "";
    rows.push(`<tr><td style="padding:28px 32px 4px">${icon}${title}</td></tr>`);
  }

  // Khoảng cách đoạn mặc định của hộp thư không đều → gán sẵn
  const content = contentHtml.replace(/<p>/g, '<p style="margin:0 0 10px">');
  rows.push(`<tr><td style="padding:${hasHeading ? 8 : 28}px 32px 4px;font-size:14px;line-height:1.65;color:#3c4652">${content}</td></tr>`);

  const { highlight, button, details } = layout;
  if (highlight) {
    const valueStyle = highlight.code ? `${MONO};font-size:34px;letter-spacing:10px` : `${MONO};font-size:22px;letter-spacing:1px`;
    const note = highlight.note ? `<div style="font-size:12px;color:#5f6b7a;margin-top:10px">${escapeHtml(highlight.note)}</div>` : "";
    rows.push(
      `<tr><td style="padding:12px 32px 4px">${table(
        `width="100%" style="background:${tone.bg};border-radius:10px"`,
        `<tr><td align="center" style="padding:20px 16px 18px">` +
          `<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5f6b7a;margin-bottom:8px">${escapeHtml(highlight.label)}</div>` +
          `<div style="${valueStyle};font-weight:700;color:${tone.fg}">${escapeHtml(highlight.value)}</div>${note}</td></tr>`,
      )}</td></tr>`,
    );
  }

  if (button) {
    rows.push(
      `<tr><td style="padding:24px 32px 4px">${table(
        `width="100%"`,
        `<tr><td bgcolor="${BRAND}" align="center" style="border-radius:10px;background:${BRAND}">` +
          `<a href="${escapeHtml(button.link)}" style="display:block;padding:15px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:.2px">${escapeHtml(button.label)} &nbsp;&rarr;</a>` +
          `</td></tr>`,
      )}</td></tr>`,
    );
  }

  if (details) {
    const lines = details.rows
      .map(
        ([label, value]) =>
          `<div><span style="display:inline-block;min-width:80px">${escapeHtml(label)}</span><span style="color:#1d2129">${escapeHtml(value)}</span></div>`,
      )
      .join("");
    const note = details.note ? `<div style="margin-top:6px">${escapeHtml(details.note)}</div>` : "";
    rows.push(
      `<tr><td style="padding:20px 32px 0">${table(
        `width="100%" style="border:1px solid #e5e8ec;border-radius:8px"`,
        `<tr><td style="padding:12px 16px;font-size:12px;line-height:1.7;color:#5f6b7a">` +
          `<div style="font-weight:600;color:#1d2129;margin-bottom:2px">${escapeHtml(details.title)}</div>${lines}${note}</td></tr>`,
      )}</td></tr>`,
    );
  }

  rows.push(`<tr><td style="padding:28px 32px 0;font-size:0;line-height:0">&nbsp;</td></tr>`);

  const header =
    `<tr><td style="padding:0 4px 14px">` +
    `<img src="{{app.logo}}" width="28" height="28" alt="{{app.name}}" style="display:inline-block;width:28px;height:28px;border:0;border-radius:7px;vertical-align:middle">` +
    `<span style="font-size:15px;font-weight:700;color:#1d2129;vertical-align:middle;margin-left:8px">{{app.name}}</span></td></tr>`;
  const card = `<tr><td style="background:#ffffff;border-radius:12px;border:1px solid #e5e8ec;overflow:hidden">${table(`width="100%"`, rows.join(""))}</td></tr>`;
  const footer =
    `<tr><td align="center" style="padding:18px 16px 0;font-size:12px;line-height:1.6;color:#8a94a3">` +
    `Email được gửi tự động từ {{app.name}}, vui lòng không trả lời.<br>` +
    `<a href="{{app.link}}" style="color:#8a94a3">{{app.link}}</a></td></tr>`;

  return table(`width="100%" style="max-width:560px;margin:0 auto"`, header + card + footer);
}

// ===== Gửi =====

/** Nền xám bọc ngoài nội dung email */
export function wrapEmailDocument(bodyHtml: string) {
  return table(
    `width="100%" style="background:#f2f4f7;padding:32px 12px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#3c4652"`,
    `<tr><td align="center">${bodyHtml}</td></tr>`,
  );
}

/** Nội dung cũ chỉ là vài đoạn văn (soạn trước khi mẫu là toàn bộ email) → bọc vào thẻ mặc định */
const isFullEmailBody = (body: string) => /<table[\s>]/i.test(body);

/** Email hoàn chỉnh từ mẫu: thay biến ở tiêu đề + nội dung (app.* tự điền), bọc nền xám */
export function renderEmail(template: EmailTemplateBody, vars: Record<string, string | undefined>) {
  const all = { ...brandVariables(), ...vars };
  const body = isFullEmailBody(template.body) ? template.body : buildEmailBody(template.body);
  return {
    subject: renderTemplate(template.subject, all, { html: false }),
    html: wrapEmailDocument(renderTemplate(body, all, { html: true })),
  };
}
