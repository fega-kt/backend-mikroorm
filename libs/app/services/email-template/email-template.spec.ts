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
});
