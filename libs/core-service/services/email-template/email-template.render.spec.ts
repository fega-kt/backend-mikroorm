import { describe, expect, it } from "vitest";
import { CORE_EMAIL_TEMPLATES, CoreEmailTemplate } from "./core-email.templates";
import { dropEmptyLabelLines, renderEmail } from "./email-template.render";

describe("inactive reminder email template", () => {
  const vars = { "user.name": "An", "user.email": "an@x.vn", "inactive.days": "10" };

  it("tells the user how many days are left before the account is locked", () => {
    const { html } = renderEmail(CORE_EMAIL_TEMPLATES[CoreEmailTemplate.InactiveReminder], { ...vars, "lock.daysLeft": "23" });
    expect(html).toContain("10 ngày");
    expect(html).toContain("sẽ bị khóa sau 23 ngày nữa");
  });
});

describe("dropEmptyLabelLines", () => {
  it("drops a paragraph that is only a label when its variable is empty", () => {
    const html = '<p style="margin:0">Xin chào {{recipient.name}},</p><p style="margin:0">Lời nhắn: {{message}}</p>';
    expect(dropEmptyLabelLines(html, { "recipient.name": "An", message: "" })).toBe('<p style="margin:0">Xin chào {{recipient.name}},</p>');
  });

  it("keeps the line when the variable has a value", () => {
    const html = "<p>Lời nhắn: {{message}}</p>";
    expect(dropEmptyLabelLines(html, { message: "Xem giúp mục chi phí" })).toBe(html);
  });

  it("drops only the empty lines inside a paragraph split by <br>", () => {
    const html = "<p>Loại tờ trình: {{request.type}}<br>Người trình: {{request.requester}}<br>Đơn vị: {{request.department}}</p>";
    expect(dropEmptyLabelLines(html, { "request.type": "Nghỉ phép", "request.requester": "", "request.department": "Phòng A" })).toBe(
      "<p>Loại tờ trình: {{request.type}}<br>Đơn vị: {{request.department}}</p>",
    );
  });

  it("handles labels wrapped in tags and leaves lines without a trailing colon alone", () => {
    expect(dropEmptyLabelLines("<p><strong>Nội dung:</strong> {{message}}</p>", {})).toBe("");
    expect(dropEmptyLabelLines("<p>{{message}}</p>", {})).toBe("<p>{{message}}</p>");
    expect(dropEmptyLabelLines("<p>Trân trọng:</p>", {})).toBe("<p>Trân trọng:</p>");
  });
});
