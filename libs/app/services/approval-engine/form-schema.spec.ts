import { describe, expect, it } from "vitest";
import { FormFieldType, buildPayloadValidator, formSchemaSchema } from "./form-schema";

const leaveForm = formSchemaSchema.parse([
  { key: "dates", label: "Thời gian nghỉ", type: FormFieldType.DateRange, required: true },
  { key: "days", label: "Số ngày", type: FormFieldType.Number, required: true, min: 0.5 },
  {
    key: "kind",
    label: "Loại nghỉ",
    type: FormFieldType.Select,
    required: true,
    options: [
      { label: "Phép năm", value: "annual" },
      { label: "Không lương", value: "unpaid" },
    ],
  },
  { key: "reason", label: "Lý do", type: FormFieldType.Textarea },
]);

describe("form-schema", () => {
  const validator = buildPayloadValidator(leaveForm);

  it("accepts a valid payload and strips unknown keys", () => {
    const parsed = validator.parse({ dates: ["2026-10-20", "2026-10-22"], days: 3, kind: "annual", extra: 1 });
    expect(parsed).toEqual({ dates: ["2026-10-20", "2026-10-22"], days: 3, kind: "annual" });
  });

  it("rejects missing required fields and wrong values", () => {
    const result = validator.safeParse({ days: 0, kind: "sick" });
    expect(result.success).toBe(false);
    const paths = result.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["dates", "days", "kind"]));
  });

  it("rejects duplicate keys and select without options", () => {
    const result = formSchemaSchema.safeParse([
      { key: "a", label: "A", type: "text" },
      { key: "a", label: "A2", type: "select" },
    ]);
    expect(result.success).toBe(false);
    expect(result.error.issues).toHaveLength(2);
  });

  it("validates user / department fields as { id, name } and honours multiple", () => {
    const fields = formSchemaSchema.parse([
      { key: "handover", label: "Bàn giao", type: FormFieldType.User, required: true, span: 6 },
      { key: "depts", label: "Phòng ban", type: FormFieldType.Department, multiple: true },
    ]);
    const v = buildPayloadValidator(fields);
    expect(v.safeParse({ handover: { id: "u1", name: "An" }, depts: [{ id: "d1", name: "IT" }] }).success).toBe(true);
    expect(v.safeParse({ handover: "u1" }).success).toBe(false);
    expect(v.safeParse({ handover: { id: "u1", name: "An" }, depts: { id: "d1", name: "IT" } }).success).toBe(false);
  });

  it("rejects span outside the 12-column grid", () => {
    expect(formSchemaSchema.safeParse([{ key: "a", label: "A", type: "text", span: 13 }]).success).toBe(false);
  });
});
