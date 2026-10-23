import { describe, expect, it } from "vitest";
import {
  FormFieldType,
  FormulaOperator,
  TABLE_ROW_ID,
  buildPayloadValidator,
  computeFormula,
  ensureTableRowIds,
  formSchemaSchema,
} from "./form-schema";

/** Dữ liệu mẫu của trường bảng: gắn mã dòng (bắt buộc) row-1, row-2… */
const withIds = <T extends Record<string, unknown>>(rows: T[]) =>
  rows.map((row, index) => ({ [TABLE_ROW_ID]: `row-${index + 1}`, ...row }));

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

  it('enforces minDate / maxDate, including "today"', () => {
    const fields = formSchemaSchema.parse([
      { key: "from", label: "Từ", type: FormFieldType.Date, required: true, minDate: "2026-01-10", maxDate: "2026-01-20" },
      { key: "future", label: "Tương lai", type: FormFieldType.Date, minDate: "today" },
    ]);
    const v = buildPayloadValidator(fields);
    expect(v.safeParse({ from: "2026-01-15" }).success).toBe(true);
    expect(v.safeParse({ from: "2026-01-09" }).success).toBe(false);
    expect(v.safeParse({ from: "2026-01-21" }).success).toBe(false);
    expect(v.safeParse({ from: "2026-01-15", future: "2000-01-01" }).success).toBe(false);
    expect(v.safeParse({ from: "2026-01-15", future: "2999-01-01" }).success).toBe(true);
    expect(formSchemaSchema.safeParse([{ key: "a", label: "A", type: "date", minDate: "2026-02-01", maxDate: "2026-01-01" }]).success).toBe(
      false,
    );
  });

  it("rejects span outside the 12-column grid", () => {
    expect(formSchemaSchema.safeParse([{ key: "a", label: "A", type: "text", span: 13 }]).success).toBe(false);
  });

  it("keeps the principal type and user id, and still accepts old { id, name } values", () => {
    const principals = buildPayloadValidator(
      formSchemaSchema.parse([{ key: "to", label: "Gửi tới", type: FormFieldType.Principal, multiple: true }]),
    );
    const value = [
      { id: "p1", name: "Nguyễn Văn A", type: "user", userId: "u1" },
      { id: "p2", name: "Nhóm kế toán", type: "group" },
      { id: "p3", name: "Phiếu cũ" },
    ];
    expect(principals.parse({ to: value })).toEqual({ to: value });
    expect(principals.safeParse({ to: [{ id: "p1", name: "A", type: "department" }] }).success).toBe(false);
  });
});

describe("form-schema — trường bảng", () => {
  const equipmentForm = formSchemaSchema.parse([
    {
      key: "items",
      label: "Danh sách thiết bị",
      type: FormFieldType.Table,
      required: true,
      maxRows: 3,
      columns: [
        { key: "name", label: "Tên thiết bị", type: FormFieldType.Text, required: true },
        { key: "kind", label: "Loại", type: FormFieldType.Select, options: [{ label: "Laptop", value: "laptop" }] },
        { key: "qty", label: "Số lượng", type: FormFieldType.Number, required: true, min: 1 },
        { key: "price", label: "Đơn giá", type: FormFieldType.Money },
      ],
    },
  ]);
  const validator = buildPayloadValidator(equipmentForm);

  it("nhận các dòng hợp lệ, ô không bắt buộc được để trống, bỏ cột lạ", () => {
    const parsed = validator.parse({
      items: withIds([
        { name: "Laptop", kind: "laptop", qty: 2, price: 1000, extra: 1 },
        { name: "Chuột", qty: 1 },
      ]),
    });
    expect(parsed).toEqual({
      items: [
        { _id: "row-1", name: "Laptop", kind: "laptop", qty: 2, price: 1000 },
        { _id: "row-2", name: "Chuột", qty: 1 },
      ],
    });
  });

  it("không cho đặt mã cột trùng khóa mã dòng", () => {
    const table = { key: "items", label: "Bảng", type: FormFieldType.Table };
    expect(
      formSchemaSchema.safeParse([{ ...table, columns: [{ key: TABLE_ROW_ID, label: "Mã", type: FormFieldType.Text }] }]).success,
    ).toBe(false);
  });

  it("mã dòng bắt buộc, không trùng trong bảng, tối đa 64 ký tự", () => {
    expect(validator.safeParse({ items: [{ name: "Laptop", qty: 1 }] }).success).toBe(false);
    expect(validator.safeParse({ items: [{ _id: "", name: "Laptop", qty: 1 }] }).success).toBe(false);
    expect(validator.safeParse({ items: [{ _id: "x".repeat(65), name: "Laptop", qty: 1 }] }).success).toBe(false);
    const duplicated = validator.safeParse({
      items: [
        { _id: "row-a", name: "Laptop", qty: 1 },
        { _id: "row-a", name: "Chuột", qty: 1 },
      ],
    });
    expect(duplicated.success).toBe(false);
    expect(duplicated.error?.issues[0]?.path).toEqual(["items", 1, TABLE_ROW_ID]);
  });

  it("kiểm từng ô theo cột và số dòng tối thiểu / tối đa", () => {
    expect(validator.safeParse({ items: withIds([{ name: "", qty: 1 }]) }).success).toBe(false);
    expect(validator.safeParse({ items: withIds([{ name: "Laptop", qty: 0 }]) }).success).toBe(false);
    expect(validator.safeParse({ items: withIds([{ name: "Laptop", qty: 1, kind: "phone" }]) }).success).toBe(false);
    expect(validator.safeParse({ items: [] }).success).toBe(false);
    const row = { name: "Laptop", qty: 1 };
    expect(validator.safeParse({ items: withIds([row, row, row]) }).success).toBe(true);
    expect(validator.safeParse({ items: withIds([row, row, row, row]) }).success).toBe(false);
  });

  it("cấu hình bảng sai thì không lưu được biểu mẫu", () => {
    const table = { key: "items", label: "Bảng", type: FormFieldType.Table };
    expect(formSchemaSchema.safeParse([{ ...table, columns: [] }]).success).toBe(false);
    const duplicated = [
      { key: "a", label: "A", type: FormFieldType.Text },
      { key: "a", label: "B", type: FormFieldType.Number },
    ];
    expect(formSchemaSchema.safeParse([{ ...table, columns: duplicated }]).success).toBe(false);
    expect(formSchemaSchema.safeParse([{ ...table, columns: [{ key: "k", label: "K", type: FormFieldType.Select }] }]).success).toBe(false);
    expect(formSchemaSchema.safeParse([{ ...table, columns: [{ key: "t", label: "T", type: FormFieldType.Table }] }]).success).toBe(false);
    expect(
      formSchemaSchema.safeParse([{ ...table, minRows: 5, maxRows: 2, columns: [{ key: "a", label: "A", type: FormFieldType.Text }] }])
        .success,
    ).toBe(false);
  });
});

describe("form-schema — cột công thức", () => {
  const columns = [
    { key: "qty", label: "Số lượng", type: FormFieldType.Number, required: true },
    { key: "price", label: "Đơn giá", type: FormFieldType.Money },
    {
      key: "amount",
      label: "Thành tiền",
      type: FormFieldType.Formula,
      formula: { left: "qty", op: FormulaOperator.Multiply, right: "price" },
      showTotal: true,
    },
    { key: "vat", label: "Thuế", type: FormFieldType.Formula, formula: { left: "price", op: FormulaOperator.Multiply, right: 0.1 } },
  ];
  const validator = buildPayloadValidator(
    formSchemaSchema.parse([{ key: "items", label: "Thiết bị", type: FormFieldType.Table, columns }]),
  );

  it("server tự tính cột công thức, bỏ giá trị client gửi lên", () => {
    const parsed = validator.parse({ items: withIds([{ qty: 3, price: 1000, amount: 999999 }, { qty: 2 }]) });
    expect(parsed).toEqual({
      items: [
        { _id: "row-1", qty: 3, price: 1000, amount: 3000, vat: 100 },
        { _id: "row-2", qty: 2 },
      ],
    });
  });

  it("chia cho 0 hoặc thiếu toán hạng thì không có giá trị; làm tròn 2 chữ số", () => {
    expect(computeFormula({ a: 1 }, { left: "a", op: FormulaOperator.Divide, right: 0 })).toBeUndefined();
    expect(computeFormula({ a: 1 }, { left: "a", op: FormulaOperator.Add, right: "b" })).toBeUndefined();
    expect(computeFormula({ a: 0.1, b: 0.2 }, { left: "a", op: FormulaOperator.Add, right: "b" })).toBe(0.3);
  });

  it("công thức phải tham chiếu cột số / số tiền của cùng bảng và chỉ dùng trong bảng", () => {
    const table = (formula: unknown) => [
      {
        key: "items",
        label: "Bảng",
        type: FormFieldType.Table,
        columns: [
          { key: "name", label: "Tên", type: FormFieldType.Text },
          { key: "x", label: "X", type: FormFieldType.Formula, formula },
        ],
      },
    ];
    expect(formSchemaSchema.safeParse(table({ left: "name", op: "*", right: 2 })).success).toBe(false);
    expect(formSchemaSchema.safeParse(table({ left: "missing", op: "*", right: 2 })).success).toBe(false);
    expect(formSchemaSchema.safeParse(table(undefined)).success).toBe(false);
    expect(formSchemaSchema.safeParse([{ key: "f", label: "F", type: FormFieldType.Formula }]).success).toBe(false);
  });
});

describe("form-schema — cột không được trùng", () => {
  const validator = buildPayloadValidator(
    formSchemaSchema.parse([
      {
        key: "items",
        label: "Thiết bị",
        type: FormFieldType.Table,
        columns: [
          { key: "name", label: "Tên", type: FormFieldType.Text, unique: true },
          {
            key: "kind",
            label: "Loại",
            type: FormFieldType.Select,
            unique: true,
            options: [
              { label: "A", value: "a" },
              { label: "B", value: "b" },
            ],
          },
          { key: "qty", label: "SL", type: FormFieldType.Number },
        ],
      },
    ]),
  );

  it("báo trùng ở cột bật unique (văn bản không phân biệt hoa thường, bỏ khoảng trắng)", () => {
    expect(validator.safeParse({ items: withIds([{ name: "Laptop" }, { name: " laptop " }]) }).success).toBe(false);
    expect(validator.safeParse({ items: withIds([{ kind: "a" }, { kind: "a" }]) }).success).toBe(false);
  });

  it("ô trống không tính trùng, cột không bật unique được lặp", () => {
    expect(validator.safeParse({ items: withIds([{ name: "A", qty: 1 }, { name: "B", qty: 1 }, { qty: 2 }, { qty: 3 }]) }).success).toBe(
      true,
    );
  });
});

describe("form-schema — cấp mã dòng khi lưu", () => {
  const fields = formSchemaSchema.parse([
    { key: "items", label: "Thiết bị", type: FormFieldType.Table, columns: [{ key: "name", label: "Tên", type: FormFieldType.Text }] },
    { key: "people", label: "Người", type: FormFieldType.User, multiple: true },
  ]);

  it("giữ mã sẵn có, cấp mã cho dòng thiếu / rỗng / trùng, không đụng trường khác", () => {
    const people = [{ id: "u1", name: "A" }];
    const result = ensureTableRowIds(fields, {
      items: [{ _id: "keep", name: "Laptop" }, { _id: "keep", name: "Chuột" }, { _id: "", name: "SSD" }, { name: "Bàn phím" }],
      people,
    }) as { items: { _id: string }[]; people: unknown };
    const ids = result.items.map((row) => row._id);
    expect(ids[0]).toBe("keep");
    expect(new Set(ids).size).toBe(4);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(result.people).toBe(people);
    // Kết quả qua được bước kiểm lúc gửi duyệt
    expect(buildPayloadValidator(fields).safeParse(result).success).toBe(true);
  });

  it("không có form thì trả nguyên payload", () => {
    expect(ensureTableRowIds(null, { items: [{ name: "x" }] })).toEqual({ items: [{ name: "x" }] });
  });
});
