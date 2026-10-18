import { type FormSchema, FormFieldType } from "../approval-engine/form-schema";

/** Nhóm bản dịch của một biểu mẫu — khớp `formI18nNamespace` ở frontend */
export const formI18nNamespace = (formId: string) => `form.${formId}`;

export const fieldI18nKey = (fieldKey: string, part: "label" | "placeholder") => `field.${fieldKey}.${part}`;
export const optionI18nKey = (fieldKey: string, value: string) => `field.${fieldKey}.option.${value}`;
/** Cột của trường bảng: nhãn và nhãn lựa chọn nằm dưới trường bảng */
export const columnI18nKey = (fieldKey: string, columnKey: string) => `field.${fieldKey}.column.${columnKey}.label`;
export const columnOptionI18nKey = (fieldKey: string, columnKey: string, value: string) =>
  `field.${fieldKey}.column.${columnKey}.option.${value}`;

/**
 * key → chuỗi gốc (tiếng Việt) của mọi chuỗi cần dịch: nhãn, gợi ý nhập, nhãn từng lựa chọn (giống `collectFormStrings` ở frontend).
 * Truyền các phiên bản từ mới đến cũ: key có ở nhiều phiên bản thì lấy chuỗi của bản mới nhất;
 * key chỉ còn ở phiên bản cũ vẫn được giữ vì phiếu tạo theo phiên bản đó vẫn hiển thị nó.
 */
export function formTranslationSources(schemas: (FormSchema | null | undefined)[]): Record<string, string> {
  const sources: Record<string, string> = {};
  const add = (key: string, text?: string) => {
    if (text && !(key in sources)) sources[key] = text;
  };
  for (const schema of schemas) {
    for (const field of schema ?? []) {
      add(fieldI18nKey(field.key, "label"), field.label);
      add(fieldI18nKey(field.key, "placeholder"), field.placeholder);
      if (field.type === FormFieldType.Select) {
        for (const option of field.options ?? []) add(optionI18nKey(field.key, option.value), option.label);
      }
      for (const column of field.type === FormFieldType.Table ? (field.columns ?? []) : []) {
        add(columnI18nKey(field.key, column.key), column.label);
        for (const option of column.options ?? []) add(columnOptionI18nKey(field.key, column.key, option.value), option.label);
      }
    }
  }
  return sources;
}
