import { todayVn } from "@common/utils/vn-date.util";
import { PrincipalType } from "@core-service/entities/principal";
import { randomUUID } from "node:crypto";
import { z } from "zod";

/** Kiểu trường trong form của loại đơn — FE map sang valueType của BetaSchemaForm */
export enum FormFieldType {
  Text = "text",
  Textarea = "textarea",
  Number = "number",
  Money = "money",
  Date = "date",
  DateRange = "dateRange",
  Select = "select",
  Switch = "switch",
  /** Người dùng / phòng ban / người-nhóm: giá trị là { id, name } (hoặc mảng khi `multiple`) */
  User = "user",
  Department = "department",
  Principal = "principal",
  /** Bảng nhiều dòng: giá trị là mảng các dòng { <mã cột>: giá trị } */
  Table = "table",
  /** Chỉ dùng làm cột của bảng: giá trị tính từ các cột số khác của dòng (server tự tính) */
  Formula = "formula",
}

/** Kiểu được dùng làm cột của bảng (không lồng bảng, chưa hỗ trợ trường chọn thực thể) */
export const TABLE_COLUMN_TYPES = [
  FormFieldType.Text,
  FormFieldType.Number,
  FormFieldType.Money,
  FormFieldType.Date,
  FormFieldType.Select,
  FormFieldType.Formula,
] as const;

/** Phép tính của cột công thức */
export enum FormulaOperator {
  Add = "+",
  Subtract = "-",
  Multiply = "*",
  Divide = "/",
}

/** Kiểu cột làm toán hạng của công thức: số nhập tay (không lấy cột công thức khác để khỏi vòng lặp) */
const FORMULA_OPERAND_TYPES = new Set<FormFieldType>([FormFieldType.Number, FormFieldType.Money]);

/** Số cột tối đa của một bảng */
export const TABLE_MAX_COLUMNS = 10;
/** Số dòng tối đa của một bảng khi không cấu hình maxRows */
export const TABLE_MAX_ROWS = 200;

/** Các kiểu trường chọn thực thể: payload lưu { id, name } để hiển thị lại không cần tra cứu */
export const REFERENCE_FIELD_TYPES: ReadonlySet<FormFieldType> = new Set([
  FormFieldType.User,
  FormFieldType.Department,
  FormFieldType.Principal,
]);

const dateBound = z.string().regex(/^(today|\d{4}-\d{2}-\d{2})$/, 'Use YYYY-MM-DD or "today"');

const fieldKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Key must start with a letter and contain only letters, digits and underscores");

const selectOptions = z.array(z.object({ label: z.string().min(1), value: z.string().min(1) }));

/** Một cột của bảng: các thuộc tính của trường thường mà cột dùng được */
export const tableColumnSchema = z.object({
  key: fieldKey,
  label: z.string().trim().min(1).max(255),
  type: z.enum(TABLE_COLUMN_TYPES),
  required: z.boolean().default(false),
  options: selectOptions.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  placeholder: z.string().max(255).optional(),
  /** Cột số / số tiền / công thức: hiện tổng ở dòng cuối bảng */
  showTotal: z.boolean().optional(),
  /** Giá trị trong cột không được lặp lại giữa các dòng (ô trống không tính; văn bản so không phân biệt hoa thường) */
  unique: z.boolean().optional(),
  /** Cột công thức: <cột left> <op> <cột right | số cố định> */
  formula: z
    .object({
      left: fieldKey,
      op: z.enum(FormulaOperator),
      right: z.union([fieldKey, z.number()]),
    })
    .optional(),
  /** Cột công thức: hiển thị kết quả dạng số hay số tiền */
  resultType: z.enum([FormFieldType.Number, FormFieldType.Money]).optional(),
});

export const formFieldSchema = z.object({
  /** Tên trường trong payload, dùng trong điều kiện: { var: "payload.<key>" } */
  key: fieldKey,
  label: z.string().trim().min(1).max(255),
  type: z.enum(FormFieldType),
  required: z.boolean().default(false),
  options: selectOptions.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  placeholder: z.string().max(255).optional(),
  /** Ngày sớm nhất / muộn nhất cho date, dateRange: "YYYY-MM-DD" hoặc "today" (hôm nay, giờ Việt Nam) */
  minDate: dateBound.optional(),
  maxDate: dateBound.optional(),
  /** Cho chọn nhiều (chỉ dùng với user / department / principal) */
  multiple: z.boolean().optional(),
  /** Độ rộng trên lưới 12 cột của form; bỏ trống = cả hàng */
  span: z.number().int().min(1).max(12).optional(),
  /** Bảng: các cột (theo thứ tự hiển thị) */
  columns: z.array(tableColumnSchema).max(TABLE_MAX_COLUMNS).optional(),
  /** Bảng: số dòng tối thiểu / tối đa (bỏ trống: bắt buộc thì ≥ 1, tối đa TABLE_MAX_ROWS) */
  minRows: z.number().int().min(0).max(TABLE_MAX_ROWS).optional(),
  maxRows: z.number().int().min(1).max(TABLE_MAX_ROWS).optional(),
});

export const formSchemaSchema = z
  .array(formFieldSchema)
  .max(50)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        ctx.addIssue({ code: "custom", path: [index, "key"], message: `Duplicate field key "${field.key}"` });
      }
      seen.add(field.key);
      const { minDate, maxDate } = field;
      if (minDate && maxDate && minDate !== "today" && maxDate !== "today" && minDate > maxDate) {
        ctx.addIssue({ code: "custom", path: [index, "minDate"], message: "minDate must not be after maxDate" });
      }
      if (field.type === FormFieldType.Select && !field.options?.length) {
        ctx.addIssue({ code: "custom", path: [index, "options"], message: "Select field needs options" });
      }
      if (field.type === FormFieldType.Table) checkTable(field, index, ctx);
      if (field.type === FormFieldType.Formula) {
        ctx.addIssue({ code: "custom", path: [index, "type"], message: "Formula is only allowed as a table column" });
      }
    });
  });

/** Bảng: phải có cột, mã cột không trùng, cột lựa chọn có lựa chọn, số dòng tối thiểu không vượt tối đa */
function checkTable(field: z.infer<typeof formFieldSchema>, index: number, ctx: z.RefinementCtx) {
  const columns = field.columns ?? [];
  if (!columns.length) ctx.addIssue({ code: "custom", path: [index, "columns"], message: "Table field needs at least one column" });
  const keys = new Set<string>();
  columns.forEach((column, columnIndex) => {
    if (keys.has(column.key)) {
      ctx.addIssue({ code: "custom", path: [index, "columns", columnIndex, "key"], message: `Duplicate column key "${column.key}"` });
    }
    keys.add(column.key);
    if (column.type === FormFieldType.Select && !column.options?.length) {
      ctx.addIssue({ code: "custom", path: [index, "columns", columnIndex, "options"], message: "Select column needs options" });
    }
    if (column.type === FormFieldType.Formula && !formulaOperandsValid(column, columns)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "columns", columnIndex, "formula"],
        message: "Formula column needs operands that are number / money columns of the same table",
      });
    }
  });
  if (field.minRows !== undefined && field.maxRows !== undefined && field.minRows > field.maxRows) {
    ctx.addIssue({ code: "custom", path: [index, "minRows"], message: "minRows must not exceed maxRows" });
  }
}

export type FormField = z.infer<typeof formFieldSchema>;
export type TableColumn = z.infer<typeof tableColumnSchema>;
export type FormSchema = z.infer<typeof formSchemaSchema>;

const referenceValue = z.object({ id: z.string().min(1).max(64), name: z.string().max(255) });

/**
 * Người / nhóm: thêm loại để hiển thị đúng (avatar người hay icon nhóm) và id user của principal là người
 * (tra avatar / email mới nhất). Không bắt buộc: payload cũ chỉ có { id, name } vẫn hợp lệ.
 */
const principalValue = referenceValue.extend({
  type: z.enum(PrincipalType).optional(),
  userId: z.string().min(1).max(64).optional(),
});

const referenceList = (item: z.ZodType, field: FormField) =>
  field.multiple
    ? z
        .array(item)
        .min(field.required ? 1 : 0)
        .max(100)
    : item;

const resolveBound = (bound: string | undefined) => (bound === "today" ? todayVn() : bound);

/** Giới hạn ngày được tính lúc validate (để "today" luôn là hôm nay) */
function withDateBounds<T extends z.ZodType<string>>(schema: T, field: FormField) {
  return schema.superRefine((value, ctx) => {
    const day = value.slice(0, 10);
    const min = resolveBound(field.minDate);
    const max = resolveBound(field.maxDate);
    if (min && day < min) ctx.addIssue({ code: "custom", message: `Date must be on or after ${min}` });
    if (max && day > max) ctx.addIssue({ code: "custom", message: `Date must be on or before ${max}` });
  });
}

const isoDate = z.iso.datetime({ offset: true }).or(z.iso.date());

function fieldValidator(field: FormField): z.ZodType {
  switch (field.type) {
    case FormFieldType.Number:
    case FormFieldType.Money: {
      let schema = z.number();
      if (field.min !== undefined) schema = schema.min(field.min);
      if (field.max !== undefined) schema = schema.max(field.max);
      return schema;
    }
    case FormFieldType.Date:
      return withDateBounds(isoDate, field);
    case FormFieldType.DateRange:
      return z.tuple([withDateBounds(isoDate, field), withDateBounds(isoDate, field)]);
    case FormFieldType.Select:
      return z.enum((field.options ?? []).map((o) => o.value) as [string, ...string[]]);
    case FormFieldType.Switch:
      return z.boolean();
    case FormFieldType.User:
    case FormFieldType.Department:
      return referenceList(referenceValue, field);
    case FormFieldType.Principal:
      return referenceList(principalValue, field);
    case FormFieldType.Table:
      return tableValidator(field);
    case FormFieldType.Textarea:
      return z
        .string()
        .trim()
        .min(field.required ? 1 : 0)
        .max(field.max ?? 5000);
    case FormFieldType.Text:
    default:
      return z
        .string()
        .trim()
        .min(field.required ? 1 : 0)
        .max(field.max ?? 500);
  }
}

/**
 * Mã riêng của dòng bảng (bắt buộc, duy nhất trong bảng): client sinh khi thêm dòng, giữ nguyên khi sửa —
 * lịch sử so hai lần lưu theo mã để phân biệt sửa / thêm / xoá. Mã cột luôn bắt đầu bằng chữ cái nên không trùng khóa này.
 */
export const TABLE_ROW_ID = "_id";

/**
 * Cấp mã cho dòng bảng thiếu / trùng mã khi lưu tờ trình. Lưu nháp không kiểm payload (gửi duyệt mới kiểm, mã là bắt buộc):
 * trang FE cũ còn mở lưu dòng không mã thì vẫn gửi được, và mọi payload lưu xuống đều có mã.
 */
export function ensureTableRowIds(fields: FormSchema | null | undefined, payload: Record<string, unknown>): Record<string, unknown> {
  const result = { ...payload };
  for (const field of fields ?? []) {
    const rows = result[field.key];
    if (field.type !== FormFieldType.Table || !Array.isArray(rows)) continue;
    const seen = new Set<string>();
    result[field.key] = rows.map((row: unknown) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      const current = (row as Record<string, unknown>)[TABLE_ROW_ID];
      const id = typeof current === "string" && current.trim() && !seen.has(current) ? current : randomUUID();
      seen.add(id);
      return id === current ? row : { ...row, [TABLE_ROW_ID]: id };
    });
  }
  return result;
}

/** Bảng: mảng các dòng, mỗi dòng kiểm từng cột như một trường thường; ô không bắt buộc được để trống */
function tableValidator(field: FormField): z.ZodType {
  const columns = field.columns ?? [];
  const shape: Record<string, z.ZodType> = { [TABLE_ROW_ID]: z.string().trim().min(1).max(64) };
  for (const column of columns) {
    // Cột công thức không nhận giá trị từ client: tính lại sau khi kiểm các cột nhập tay
    if (column.type === FormFieldType.Formula) continue;
    const validator = fieldValidator(column);
    shape[column.key] = column.required ? validator : validator.optional().nullable();
  }
  const formulas = columns.filter((column) => column.type === FormFieldType.Formula && column.formula);
  const row = z
    .object(shape)
    .strip()
    .transform((values) => {
      const computed: Record<string, unknown> = { ...values };
      for (const column of formulas) {
        const result = computeFormula(values, column.formula);
        if (result !== undefined) computed[column.key] = result;
      }
      return computed;
    });
  const minRows = field.minRows ?? (field.required ? 1 : 0);
  const uniqueColumns = columns.filter((column) => column.unique && column.type !== FormFieldType.Formula);
  return z
    .array(row)
    .min(minRows)
    .max(field.maxRows ?? TABLE_MAX_ROWS)
    .superRefine((rows, ctx) => {
      const ids = new Map<unknown, number>();
      rows.forEach((values, index) => {
        const first = ids.get(values[TABLE_ROW_ID]);
        if (first === undefined) ids.set(values[TABLE_ROW_ID], index);
        else ctx.addIssue({ code: "custom", path: [index, TABLE_ROW_ID], message: `Row ${index + 1}: row id duplicates row ${first + 1}` });
      });
      for (const column of uniqueColumns) {
        const seen = new Map<string, number>();
        rows.forEach((values, index) => {
          const key = uniqueKey(values[column.key]);
          if (key === undefined) return;
          const first = seen.get(key);
          if (first === undefined) seen.set(key, index);
          else
            ctx.addIssue({
              code: "custom",
              path: [index, column.key],
              message: `Row ${index + 1}: "${column.label}" duplicates row ${first + 1}`,
            });
        });
      }
    });
}

/** Khóa so trùng của một ô: ô trống không tính; văn bản bỏ khoảng trắng và không phân biệt hoa thường */
export function uniqueKey(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    return text ? `s:${text}` : undefined;
  }
  return `${typeof value}:${String(value)}`;
}

/** Toán hạng của công thức hợp lệ: cột trái (và cột phải nếu không phải số cố định) là cột số / số tiền của cùng bảng */
function formulaOperandsValid(column: TableColumn, columns: TableColumn[]) {
  const formula = column.formula;
  if (!formula) return false;
  const isOperand = (key: string) => columns.some((c) => c.key === key && FORMULA_OPERAND_TYPES.has(c.type));
  return isOperand(formula.left) && (typeof formula.right === "number" || isOperand(formula.right));
}

/**
 * Giá trị cột công thức của một dòng; thiếu toán hạng / chia cho 0 thì không có giá trị.
 * Làm tròn 2 chữ số thập phân để tránh sai số dấu phẩy động (0.1 + 0.2).
 */
export function computeFormula(row: Record<string, unknown>, formula: TableColumn["formula"]): number | undefined {
  if (!formula) return undefined;
  const left = row[formula.left];
  const right = typeof formula.right === "number" ? formula.right : row[formula.right];
  if (typeof left !== "number" || typeof right !== "number" || !Number.isFinite(left) || !Number.isFinite(right)) return undefined;
  let result: number;
  switch (formula.op) {
    case FormulaOperator.Add:
      result = left + right;
      break;
    case FormulaOperator.Subtract:
      result = left - right;
      break;
    case FormulaOperator.Multiply:
      result = left * right;
      break;
    case FormulaOperator.Divide:
      if (right === 0) return undefined;
      result = left / right;
      break;
    default:
      return undefined;
  }
  return Math.round(result * 100) / 100;
}

/** Sinh zod validator cho payload của đơn từ formSchema của loại đơn */
export function buildPayloadValidator(fields: FormSchema) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    const validator = fieldValidator(field);
    shape[field.key] = field.required ? validator : validator.optional().nullable();
  }
  return z.object(shape).strip();
}
