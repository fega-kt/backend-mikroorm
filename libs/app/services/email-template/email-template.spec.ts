import {
  CORE_EMAIL_TEMPLATES,
  CORE_TEMPLATE_VARIABLES,
  CoreEmailTemplate,
  CORE_REQUIRED_VARIABLES,
} from "@core-service/services/email-template/core-email.templates";
import { describeUserAgent } from "@modules/mail/mail.service";
import { renderEmail } from "@core-service/services/email-template/email-template.render";
import { templateCategory } from "@core-service/services/email-template/email-template.resolve";
import { describe, expect, it } from "vitest";
import { ApprovalPriority } from "../../entities/approval-request/approval-request.entity";
import { FormFieldType } from "../approval-engine/form-schema";
import { SYSTEM_EMAIL_TEMPLATES } from "./email-template.defaults";
import { renderTemplate, TEMPLATE_VARIABLES, usedVariables } from "./email-template.render";
import { buildRequestVariables } from "./email-template.vars";

describe("email templates", () => {
  it("replaces variables and escapes values in HTML", () => {
    const html = renderTemplate(
      "<p>{{ request.title }} – {{comment}}</p>",
      { "request.title": "A & B", comment: "<b>x</b>" },
      { html: true },
    );
    expect(html).toBe("<p>A &amp; B – &lt;b&gt;x&lt;/b&gt;</p>");
    expect(renderTemplate("{{request.title}} {{unknown}}", { "request.title": "A & B" }, { html: false })).toBe("A & B ");
  });

  it("builds request variables with formatted payload fields", () => {
    const vars = buildRequestVariables({
      code: "NP-2026-0001",
      title: "Nghỉ phép",
      priority: ApprovalPriority.Urgent,
      link: "https://x/1",
      formSchema: [
        { key: "kind", label: "Loại", type: FormFieldType.Select, required: true, options: [{ label: "Phép năm", value: "annual" }] },
        { key: "paid", label: "Có lương", type: FormFieldType.Switch, required: false },
        { key: "dates", label: "Ngày", type: FormFieldType.DateRange, required: true },
      ],
      payload: { kind: "annual", paid: true, dates: ["2026-10-20", "2026-10-22"] },
    });
    expect(vars["request.priority"]).toBe("Khẩn");
    expect(vars["payload.kind"]).toBe("Phép năm");
    expect(vars["payload.paid"]).toBe("Có");
    expect(vars["payload.dates"]).toBe("20/10/2026 → 22/10/2026");
  });

  it("system templates only use known variables", () => {
    const known = new Set(TEMPLATE_VARIABLES.map((v) => v.key));
    for (const tpl of Object.values(SYSTEM_EMAIL_TEMPLATES)) {
      expect(usedVariables(`${tpl.subject} ${tpl.body}`).filter((key) => !known.has(key))).toEqual([]);
    }
  });

  it("core templates only use variables of their category", () => {
    for (const tpl of Object.values(CORE_EMAIL_TEMPLATES)) {
      const category = templateCategory(tpl.code) as keyof typeof CORE_TEMPLATE_VARIABLES;
      const known = new Set(CORE_TEMPLATE_VARIABLES[category].map((v) => v.key));
      expect(usedVariables(`${tpl.subject} ${tpl.body}`).filter((key) => !known.has(key))).toEqual([]);
    }
  });

  it("renders core emails with the fixed layout and escapes variable values", () => {
    const { subject, html } = renderEmail(CORE_EMAIL_TEMPLATES[CoreEmailTemplate.LoginOtp], {
      "user.name": "<b>A</b>",
      "otp.code": "482913",
      "otp.expiresInMinutes": "5",
      "client.ip": "1.2.3.4",
      "client.device": "Chrome · Windows",
    });
    expect(subject).toBe("Mã đăng nhập của bạn: 482913");
    expect(html).toContain("482913");
    expect(html).toContain("Hết hạn sau 5 phút");
    expect(html).toContain("1.2.3.4");
    expect(html).toContain("&lt;b&gt;A&lt;/b&gt;");
    expect(html).not.toContain("<b>A</b>");
  });

  it("default templates contain their required variables", () => {
    for (const [code, required] of Object.entries(CORE_REQUIRED_VARIABLES)) {
      const tpl = CORE_EMAIL_TEMPLATES[code as CoreEmailTemplate];
      const used = usedVariables(`${tpl.subject} ${tpl.body}`);
      expect(required.filter((key) => !used.includes(key))).toEqual([]);
    }
  });

  it("only wraps a full email body in the grey background", () => {
    const body = "<table><tr><td>{{x}}</td></tr></table>";
    const { html } = renderEmail({ subject: "s", body }, { x: "<i>t</i>" });
    expect(html).toContain("<table><tr><td>&lt;i&gt;t&lt;/i&gt;</td></tr></table>");
    expect(html).toContain("background:#f2f4f7");
    expect(html).not.toContain("border-radius:12px");
  });

  it("wraps legacy paragraph-only bodies in the default card", () => {
    const { html } = renderEmail({ subject: "s", body: "<p>Hello</p>" }, {});
    expect(html).toContain("border-radius:12px");
    expect(html).toContain('<p style="margin:0 0 10px">Hello</p>');
    expect(html).not.toContain("{{app.name}}");
  });

  it("describes user agents briefly", () => {
    const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0";
    const android = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36";
    expect(describeUserAgent(edge)).toBe("Edge · Windows");
    expect(describeUserAgent(android)).toBe("Chrome · Android");
    expect(describeUserAgent(undefined)).toBe("unknown");
  });
});
