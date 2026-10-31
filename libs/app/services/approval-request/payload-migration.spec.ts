import { describe, expect, it } from "vitest";
import { FormFieldType, FormulaOperator, TABLE_ROW_ID, type FormField, type TableColumn } from "../approval-engine/form-schema";
import { migratePayload } from "./payload-migration";

const field = (key: string, type: FormFieldType, extra: Partial<FormField> = {}): FormField => ({
  key,
  label: key,
  type,
  required: false,
  ...extra,
});
const column = (key: string, type: TableColumn["type"], extra: Partial<TableColumn> = {}): TableColumn => ({
  key,
  label: key,
  type,
  required: false,
  ...extra,
});
const options = (...values: string[]) => values.map((value) => ({ label: value, value }));

describe("migratePayload", () => {
  it("giữ trường cùng mã và kiểu, bỏ trường không còn, trường mới để trống", () => {
    const from = [field("reason", FormFieldType.Text), field("note", FormFieldType.Text)];
    const to = [field("reason", FormFieldType.Text), field("project", FormFieldType.Text, { required: true })];
    expect(migratePayload(from, to, { reason: "Mua VPP", note: "gấp" })).toEqual({ reason: "Mua VPP" });
  });

  it("đổi kiểu tương thích thì giữ, không tương thích thì để trống", () => {
    const from = [field("reason", FormFieldType.Text), field("amount", FormFieldType.Number), field("code", FormFieldType.Text)];
    const to = [field("reason", FormFieldType.Textarea), field("amount", FormFieldType.Money), field("code", FormFieldType.Number)];
    expect(migratePayload(from, to, { reason: "a", amount: 10, code: "X1" })).toEqual({ reason: "a", amount: 10 });
  });

  it("giữ giá trị vi phạm ràng buộc mới (gửi duyệt mới kiểm)", () => {
    const from = [field("amount", FormFieldType.Number), field("day", FormFieldType.Date)];
    const to = [field("amount", FormFieldType.Money, { max: 50 }), field("day", FormFieldType.Date, { minDate: "today" })];
    expect(migratePayload(from, to, { amount: 80, day: "2020-01-01" })).toEqual({ amount: 80, day: "2020-01-01" });
  });

  it("lựa chọn không còn trong danh sách thì để trống", () => {
    const from = [field("method", FormFieldType.Select, { options: options("cash", "bank") })];
    const to = [field("method", FormFieldType.Select, { options: options("bank") })];
    expect(migratePayload(from, to, { method: "cash" })).toEqual({});
    expect(migratePayload(from, to, { method: "bank" })).toEqual({ method: "bank" });
  });

  it("trường chọn người: một ↔ nhiều", () => {
    const one = { id: "u1", name: "A" };
    const two = { id: "u2", name: "B" };
    const single = [field("owner", FormFieldType.User)];
    const multiple = [field("owner", FormFieldType.User, { multiple: true })];
    expect(migratePayload(single, multiple, { owner: one })).toEqual({ owner: [one] });
    expect(migratePayload(multiple, single, { owner: [one] })).toEqual({ owner: one });
    expect(migratePayload(multiple, single, { owner: [one, two] })).toEqual({});
  });

  it("bỏ giá trị sai dạng và null", () => {
    const schema = [field("amount", FormFieldType.Number), field("note", FormFieldType.Text)];
    expect(migratePayload(schema, schema, { amount: "10", note: null })).toEqual({});
  });

  it("bảng: giữ mã dòng, cột theo mã cột, tính lại cột công thức", () => {
    const from = [
      field("items", FormFieldType.Table, {
        columns: [column("name", FormFieldType.Text), column("qty", FormFieldType.Number), column("old", FormFieldType.Text)],
      }),
    ];
    const to = [
      field("items", FormFieldType.Table, {
        columns: [
          column("name", FormFieldType.Text),
          column("qty", FormFieldType.Number),
          column("price", FormFieldType.Money),
          column("total", FormFieldType.Formula, { formula: { left: "qty", op: FormulaOperator.Multiply, right: 2 } }),
        ],
      }),
    ];
    const payload = { items: [{ [TABLE_ROW_ID]: "r1", name: "Bút", qty: 3, old: "x", total: 999 }] };
    expect(migratePayload(from, to, payload)).toEqual({ items: [{ [TABLE_ROW_ID]: "r1", name: "Bút", qty: 3, total: 6 }] });
  });
});
