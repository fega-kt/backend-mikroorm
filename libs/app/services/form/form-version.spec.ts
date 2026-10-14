import { describe, expect, it } from "vitest";
import { sameFormSchema } from "./form-version";

const schema = [{ key: "amount", label: "Số tiền", type: "money" }] as never;

describe("sameFormSchema", () => {
  it("giống hệt → không đổi", () => {
    expect(sameFormSchema(schema, structuredClone(schema))).toBe(true);
  });

  it("null / undefined coi như nhau", () => {
    expect(sameFormSchema(null, undefined)).toBe(true);
  });

  it("đổi nhãn hoặc thêm / bớt trường → đổi", () => {
    const renamed = [{ key: "amount", label: "Tổng tiền", type: "money" }] as never;
    expect(sameFormSchema(schema, renamed)).toBe(false);
    expect(sameFormSchema(schema, [])).toBe(false);
  });
});
