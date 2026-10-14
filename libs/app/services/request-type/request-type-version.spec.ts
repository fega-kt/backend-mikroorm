import { describe, expect, it } from "vitest";
import { RequestTypeStatus } from "../../entities/request-type";
import { sameSnapshot, type TypeSnapshot } from "./request-type-version";

const base: TypeSnapshot = {
  code: "LEAVE",
  name: "Nghỉ phép",
  prefix: "NP",
  categoryId: "c1",
  formId: "f1",
  status: RequestTypeStatus.Published,
};

describe("sameSnapshot", () => {
  it("giống hệt → không đổi", () => {
    expect(sameSnapshot(base, { ...base })).toBe(true);
  });

  it("null / undefined / rỗng coi như nhau", () => {
    expect(sameSnapshot({ ...base, description: null, attachmentConfig: undefined }, { ...base, description: "" })).toBe(true);
  });

  it("đổi tên, tiền tố, danh mục hoặc biểu mẫu → đổi", () => {
    expect(sameSnapshot(base, { ...base, name: "Nghỉ" })).toBe(false);
    expect(sameSnapshot(base, { ...base, prefix: "NN" })).toBe(false);
    expect(sameSnapshot(base, { ...base, categoryId: "c2" })).toBe(false);
    expect(sameSnapshot(base, { ...base, formId: "f2" })).toBe(false);
  });

  it("đổi trạng thái → đổi (trạng thái cũng được ghi theo phiên bản)", () => {
    expect(sameSnapshot(base, { ...base, status: RequestTypeStatus.Cancelled })).toBe(false);
  });

  it("đổi cấu hình tệp → đổi", () => {
    expect(sameSnapshot({ ...base, attachmentConfig: { a: 1 } as never }, { ...base, attachmentConfig: { a: 2 } as never })).toBe(false);
  });
});
