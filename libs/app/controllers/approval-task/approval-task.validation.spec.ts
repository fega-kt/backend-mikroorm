import { describe, expect, it } from "vitest";
import { signApproveValidation } from "./approval-task.validation";

const sign = (width: number, height: number) =>
  signApproveValidation.safeParse({ pin: "123456", placements: { doc: { page: 1, x: 10, y: 10, width, height } } });

describe("signApproveValidation – kích thước khung chữ ký", () => {
  it("nhận khung chuẩn và khung phóng trong khoảng cho phép, giữ tỉ lệ", () => {
    expect(sign(170, 72).success).toBe(true);
    expect(sign(102, 43.2).success).toBe(true); // 0,6 lần
    expect(sign(272, 115.2).success).toBe(true); // 1,6 lần
    expect(sign(200.3, 84.8).success).toBe(true); // sai số làm tròn ở giao diện
  });

  it("từ chối khung lệch tỉ lệ", () => {
    expect(sign(180, 70).success).toBe(false);
  });

  it("từ chối khung nhỏ hơn 0,6 lần hoặc lớn hơn 1,6 lần", () => {
    expect(sign(85, 36).success).toBe(false);
    expect(sign(340, 144).success).toBe(false);
  });
});
