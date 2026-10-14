import { describe, expect, it } from "vitest";
import { buildChange, diffFiles, diffPayload, type FileChangeItem } from "./request-change-log";
import { RequestFileCategory } from "./request-file.constants";

const file = (id: string, block = RequestFileCategory.Attachments): FileChangeItem => ({ id, filename: `${id}.pdf`, block });

describe("diffPayload", () => {
  it("chỉ trả về khóa đổi giá trị, kèm tiền tố payload.", () => {
    const changes = diffPayload({ amount: 10, note: "a", same: 1 }, { amount: 25, note: "a", same: 1 });
    expect(changes).toEqual([{ field: "payload.amount", from: 10, to: 25 }]);
  });

  it("coi undefined / chuỗi rỗng / null là như nhau — không sinh thay đổi", () => {
    expect(diffPayload({ note: null }, {})).toEqual([]);
    expect(diffPayload({ note: "" }, { note: undefined })).toEqual([]);
  });

  it("khóa mới thêm và khóa bị bỏ đều được ghi", () => {
    const changes = diffPayload({ old: "x" }, { added: "y" });
    expect(changes).toEqual([
      { field: "payload.old", from: "x", to: null },
      { field: "payload.added", from: null, to: "y" },
    ]);
  });

  it("so sánh sâu với mảng / object", () => {
    expect(diffPayload({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toEqual([]);
    expect(diffPayload({ tags: ["a"] }, { tags: ["a", "b"] })).toHaveLength(1);
  });
});

describe("buildChange", () => {
  it("cắt văn bản quá dài", () => {
    const change = buildChange("title", "x".repeat(600), "y");
    expect((change.from as string).length).toBe(501);
    expect(change.to).toBe("y");
  });
});

describe("diffFiles", () => {
  it("tách tệp thêm và tệp gỡ theo id", () => {
    const { added, removed } = diffFiles([file("f0"), file("f1")], [file("f1"), file("f2")]);
    expect(added.map((f) => f.id)).toEqual(["f2"]);
    expect(removed.map((f) => f.id)).toEqual(["f0"]);
  });

  it("không đổi → rỗng", () => {
    expect(diffFiles([file("f1")], [file("f1")])).toEqual({ added: [], removed: [] });
  });
});
