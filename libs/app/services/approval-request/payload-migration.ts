import {
  computeFormula,
  FormFieldType,
  REFERENCE_FIELD_TYPES,
  TABLE_ROW_ID,
  type FormField,
  type FormSchema,
  type TableColumn,
} from "../approval-engine/form-schema";

type FieldLike = FormField | TableColumn;

/** Nhóm kiểu chuyển qua lại được mà giữ nguyên giá trị */
const TYPE_FAMILIES: FormFieldType[][] = [
  [FormFieldType.Text, FormFieldType.Textarea],
  [FormFieldType.Number, FormFieldType.Money],
];

const sameFamily = (a: FormFieldType, b: FormFieldType) => a === b || TYPE_FAMILIES.some((f) => f.includes(a) && f.includes(b));

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Giá trị đúng dạng của kiểu (không kiểm ràng buộc min / max / ngày / bắt buộc — lúc gửi mới kiểm) */
function hasShape(type: FormFieldType, value: unknown) {
  switch (type) {
    case FormFieldType.Text:
    case FormFieldType.Textarea:
    case FormFieldType.Date:
    case FormFieldType.Select:
      return typeof value === "string";
    case FormFieldType.Number:
    case FormFieldType.Money:
      return typeof value === "number" && Number.isFinite(value);
    case FormFieldType.Switch:
      return typeof value === "boolean";
    case FormFieldType.DateRange:
      return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "string");
    case FormFieldType.Table:
      return Array.isArray(value);
    default:
      return REFERENCE_FIELD_TYPES.has(type) ? isRecord(value) || (Array.isArray(value) && value.every(isRecord)) : false;
  }
}

/** Giá trị của một trường / cột sang định nghĩa mới; undefined = bỏ (để trống) */
function migrateValue(from: FieldLike, to: FieldLike, value: unknown): unknown {
  if (value === undefined || value === null || to.type === FormFieldType.Formula) return undefined;
  if (!sameFamily(from.type, to.type) || !hasShape(to.type, value)) return undefined;
  if (to.type === FormFieldType.Select) return to.options?.some((o) => o.value === value) ? value : undefined;
  if (REFERENCE_FIELD_TYPES.has(to.type)) {
    const list = Array.isArray(value) ? value : [value];
    if ("multiple" in to && to.multiple) return list;
    return list.length === 1 ? list[0] : undefined;
  }
  if (to.type === FormFieldType.Table) {
    return migrateRows((from as FormField).columns ?? [], to.columns ?? [], value as unknown[]);
  }
  return value;
}

/** Dòng bảng: giữ mã dòng, cột theo mã cột, cột công thức tính lại theo công thức mới */
function migrateRows(fromColumns: TableColumn[], toColumns: TableColumn[], rows: unknown[]) {
  return rows.filter(isRecord).map((row) => {
    const next: Record<string, unknown> = {};
    if (row[TABLE_ROW_ID] !== undefined) next[TABLE_ROW_ID] = row[TABLE_ROW_ID];
    for (const column of toColumns) {
      const from = fromColumns.find((c) => c.key === column.key);
      const value = from ? migrateValue(from, column, row[column.key]) : undefined;
      if (value !== undefined) next[column.key] = value;
    }
    for (const column of toColumns) {
      if (column.type !== FormFieldType.Formula) continue;
      const result = computeFormula(next, column.formula);
      if (result !== undefined) next[column.key] = result;
    }
    return next;
  });
}

/**
 * Chuyển payload theo form cũ sang form mới (nhân bản tờ trình sang phiên bản form mới nhất), theo mã trường:
 * trường bị bỏ / đổi sang kiểu không tương thích / lựa chọn không còn thì để trống, trường mới để trống.
 * Giá trị vi phạm ràng buộc mới (min / max, khoảng ngày, số dòng) vẫn giữ để người dùng thấy mà sửa — gửi duyệt mới kiểm.
 */
export function migratePayload(
  fromSchema: FormSchema | null | undefined,
  toSchema: FormSchema | null | undefined,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of toSchema ?? []) {
    const from = fromSchema?.find((f) => f.key === field.key);
    const value = from ? migrateValue(from, field, payload[field.key]) : undefined;
    if (value !== undefined) result[field.key] = value;
  }
  return result;
}
