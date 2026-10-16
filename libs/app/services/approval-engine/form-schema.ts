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
}

/** Các kiểu trường chọn thực thể: payload lưu { id, name } để hiển thị lại không cần tra cứu */
export const REFERENCE_FIELD_TYPES: ReadonlySet<FormFieldType> = new Set([
  FormFieldType.User,
  FormFieldType.Department,
  FormFieldType.Principal,
]);

const dateBound = z.string().regex(/^(today|\d{4}-\d{2}-\d{2})$/, "Use YYYY-MM-DD or \"today\"");

export const formFieldSchema = z.object({
  /** Tên trường trong payload, dùng trong điều kiện: { var: "payload.<key>" } */
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Key must start with a letter and contain only letters, digits and underscores"),
  label: z.string().trim().min(1).max(255),
  type: z.enum(FormFieldType),
  required: z.boolean().default(false),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).optional(),
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
    });
  });

export type FormField = z.infer<typeof formFieldSchema>;
export type FormSchema = z.infer<typeof formSchemaSchema>;

const referenceValue = z.object({ id: z.string().min(1).max(64), name: z.string().max(255) });

/** Hôm nay theo giờ Việt Nam (YYYY-MM-DD) */
function todayVn() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

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
    case FormFieldType.Principal:
      return field.multiple ? z.array(referenceValue).min(field.required ? 1 : 0).max(100) : referenceValue;
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

/** Sinh zod validator cho payload của đơn từ formSchema của loại đơn */
export function buildPayloadValidator(fields: FormSchema) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    const validator = fieldValidator(field);
    shape[field.key] = field.required ? validator : validator.optional().nullable();
  }
  return z.object(shape).strip();
}
