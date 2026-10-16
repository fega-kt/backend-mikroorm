import { describe, expect, it } from "vitest";
import { formTranslationSources } from "./form-i18n";

const current = [
  { key: "kind", label: "Loại nghỉ", type: "select", options: [{ value: "annual", label: "Phép năm" }] },
  { key: "reason", label: "Lý do", type: "textarea", placeholder: "Nhập lý do" },
] as never;

const previous = [
  { key: "kind", label: "Loại nghỉ phép", type: "select", options: [{ value: "sick", label: "Nghỉ ốm" }] },
  { key: "note", label: "Ghi chú", type: "text" },
] as never;

describe("formTranslationSources", () => {
  it("collects labels, placeholders and select options", () => {
    expect(formTranslationSources([current])).toEqual({
      "field.kind.label": "Loại nghỉ",
      "field.kind.option.annual": "Phép năm",
      "field.reason.label": "Lý do",
      "field.reason.placeholder": "Nhập lý do",
    });
  });

  it("prefers the newest version and keeps keys only found in older versions", () => {
    const sources = formTranslationSources([current, previous]);
    expect(sources["field.kind.label"]).toBe("Loại nghỉ");
    expect(sources["field.kind.option.sick"]).toBe("Nghỉ ốm");
    expect(sources["field.note.label"]).toBe("Ghi chú");
  });

  it("ignores empty schemas", () => {
    expect(formTranslationSources([null, undefined, []])).toEqual({});
  });
});
