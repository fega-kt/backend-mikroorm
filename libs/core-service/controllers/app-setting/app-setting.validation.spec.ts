import { describe, expect, it } from "vitest";
import { APP_SETTING_META, AppSettingType, AppSettingValueType, PdfViewerEngine } from "../../entities/app-setting";
import { buildAppSettingValueSchema } from "./app-setting.validation";

describe("buildAppSettingValueSchema — select", () => {
  const schema = buildAppSettingValueSchema({ type: AppSettingValueType.SELECT, isShow: true, rule: { options: ["a", "b"] } });

  it("chỉ nhận giá trị nằm trong options", () => {
    expect(schema.safeParse("a").success).toBe(true);
    expect(schema.safeParse("c").success).toBe(false);
    expect(schema.safeParse(true).success).toBe(false);
  });

  it("PDF_VIEWER nhận đúng các trình xem đã khai báo", () => {
    const pdfViewer = buildAppSettingValueSchema(APP_SETTING_META[AppSettingType.PDF_VIEWER]);
    for (const engine of Object.values(PdfViewerEngine)) expect(pdfViewer.safeParse(engine).success).toBe(true);
    expect(pdfViewer.safeParse("acrobat").success).toBe(false);
  });
});
