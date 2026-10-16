import { describe, expect, it } from "vitest";
import { namespaceValidation, saveTranslationsValidation } from "../../controllers/i18n/i18n.validation";
import { dedupeItems, fullKey, namespacePattern } from "./i18n.service";

describe("i18n keys", () => {
  it("builds the full key from namespace and key", () => {
    expect(fullKey("form.abc", "field.reason.label")).toBe("form.abc.field.reason.label");
  });

  it("escapes LIKE wildcards in the namespace pattern", () => {
    expect(namespacePattern("form.my_form")).toBe("form.my\\_form.%");
    expect(namespacePattern("a%b")).toBe("a\\%b.%");
  });
});

describe("i18n dedupeItems", () => {
  it("keeps the last item for the same key", () => {
    const result = dedupeItems([
      { key: "field.a.label", vi: "A", en: "First", zh: "一" },
      { key: "field.b.label", vi: "B", en: "B", zh: "乙" },
      { key: "field.a.label", vi: "A", en: "Second", zh: "二" },
    ]);
    expect(result).toEqual([
      { key: "field.a.label", vi: "A", en: "Second", zh: "二" },
      { key: "field.b.label", vi: "B", en: "B", zh: "乙" },
    ]);
  });
});

describe("i18n validation", () => {
  it("accepts form namespaces and rejects odd characters", () => {
    expect(namespaceValidation.safeParse("form.0b1e0f6c-1111-4222-8333-444455556666").success).toBe(true);
    expect(namespaceValidation.safeParse("form/../x").success).toBe(false);
    expect(namespaceValidation.safeParse("").success).toBe(false);
  });

  it("requires all three languages for every item", () => {
    const item = (extra: Record<string, unknown>) => ({ items: [{ key: "name", vi: "Tên", en: "Name", zh: "名称", ...extra }] });
    expect(saveTranslationsValidation.safeParse(item({})).success).toBe(true);
    expect(saveTranslationsValidation.safeParse(item({ zh: undefined })).success).toBe(false);
    expect(saveTranslationsValidation.safeParse(item({ en: "   " })).success).toBe(false);
    expect(saveTranslationsValidation.safeParse(item({ vi: null })).success).toBe(false);
  });

  it("rejects an item without a key", () => {
    expect(saveTranslationsValidation.safeParse({ items: [{ vi: "a", en: "b", zh: "c" }] }).success).toBe(false);
  });

  it("allows removing keys on their own", () => {
    const parsed = saveTranslationsValidation.parse({ remove: ["field.a.label"] });
    expect(parsed.items).toEqual([]);
    expect(parsed.remove).toEqual(["field.a.label"]);
  });
});
