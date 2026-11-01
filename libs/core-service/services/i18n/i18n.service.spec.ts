import { describe, expect, it } from "vitest";
import { namespaceValidation, saveTranslationsValidation } from "../../controllers/i18n/i18n.validation";
import { dedupeItems, escapeLike, fullKey, namespacePattern, splitKey, syncedVi } from "./i18n.service";

describe("i18n keys", () => {
  it("builds the full key from namespace and key", () => {
    expect(fullKey("form.abc", "field.reason.label")).toBe("form.abc.field.reason.label");
  });

  it("escapes LIKE wildcards in the namespace pattern", () => {
    expect(namespacePattern("form.my_form")).toBe("form.my\\_form.%");
    expect(namespacePattern("a%b")).toBe("a\\%b.%");
  });

  it("escapes LIKE wildcards in search text", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("follows the new source text unless vi was edited by hand", () => {
    expect(syncedVi("Lý do", "Lý do nghỉ", "Lý do")).toBe("Lý do nghỉ");
    expect(syncedVi("", "Lý do nghỉ", "Lý do")).toBe("Lý do nghỉ");
    expect(syncedVi("Lý do xin nghỉ", "Lý do nghỉ", "Lý do")).toBe("Lý do xin nghỉ");
    expect(syncedVi("Lý do xin nghỉ", "Lý do nghỉ")).toBe("Lý do xin nghỉ");
  });

  it("splits a full key into namespace and key", () => {
    expect(splitKey("app.system.role.group.role")).toEqual({ namespace: "app", key: "system.role.group.role" });
    expect(splitKey("form.0b1e.field.kind.option.annual")).toEqual({ namespace: "form.0b1e", key: "field.kind.option.annual" });
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
    expect(saveTranslationsValidation.safeParse(item({ en: "   " })).success).toBe(false);
    expect(saveTranslationsValidation.safeParse(item({ zh: "" })).success).toBe(false);
    expect(saveTranslationsValidation.safeParse(item({ zh: undefined })).success).toBe(false);
    expect(saveTranslationsValidation.safeParse(item({ vi: null })).success).toBe(false);
  });

  it("rejects an empty key", () => {
    expect(saveTranslationsValidation.safeParse({ items: [{ key: "  ", vi: "a", en: "b", zh: "c" }] }).success).toBe(false);
  });

  it("accepts the app namespace", () => {
    expect(namespaceValidation.safeParse("app").success).toBe(true);
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
