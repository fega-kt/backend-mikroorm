import { describe, expect, it } from "vitest";
import { slugifyFilename } from "./file-slug.util";

describe("slugifyFilename", () => {
  it("bỏ dấu tiếng Việt và chuyển đ", () => {
    expect(slugifyFilename("Biên bản xuất kho")).toBe("bien-ban-xuat-kho");
    expect(slugifyFilename("Đề nghị thanh toán")).toBe("de-nghi-thanh-toan");
  });

  it("thay ký tự lạ và gộp dấu gạch", () => {
    expect(slugifyFilename("  hợp đồng (bản_final)  v2!! ")).toBe("hop-dong-ban-final-v2");
  });

  it("cắt độ dài và không để dấu gạch ở cuối", () => {
    const slug = slugifyFilename(`${"a".repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("tên rỗng hoặc toàn ký tự lạ thì dùng 'file'", () => {
    expect(slugifyFilename("***")).toBe("file");
    expect(slugifyFilename("")).toBe("file");
  });
});
