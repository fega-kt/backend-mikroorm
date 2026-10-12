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
}

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
      if (field.type === FormFieldType.Select && !field.options?.length) {
        ctx.addIssue({ code: "custom", path: [index, "options"], message: "Select field needs options" });
      }
    });
  });

export type FormField = z.infer<typeof formFieldSchema>;
export type FormSchema = z.infer<typeof formSchemaSchema>;

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
      return isoDate;
    case FormFieldType.DateRange:
      return z.tuple([isoDate, isoDate]);
    case FormFieldType.Select:
      return z.enum((field.options ?? []).map((o) => o.value) as [string, ...string[]]);
    case FormFieldType.Switch:
      return z.boolean();
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
