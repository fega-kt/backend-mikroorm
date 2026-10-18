import { describe, expect, it, vi } from "vitest";
import { ApproverResolver, escalationCandidates } from "./approver-resolver";
import { ApproverType } from "./definition.schema";

/** Chuyển cấp một lần cho ứng viên đầu tiên còn hoạt động (escalationTarget); danh sách là thứ tự ưu tiên */

const full = { deputyId: "deputy", managerId: "manager" };

describe("escalationCandidates", () => {
  it("staff: deputy first, the manager only as a fallback", () => {
    expect(escalationCandidates("staff", full, true)).toEqual(["deputy", "manager"]);
  });

  it("only one of deputy / manager: that person", () => {
    expect(escalationCandidates("staff", { managerId: "manager" }, true)).toEqual(["manager"]);
    expect(escalationCandidates("staff", { deputyId: "deputy" }, true)).toEqual(["deputy"]);
  });

  it("empty department: nobody (the resolver moves up to the parent department)", () => {
    expect(escalationCandidates("staff", {}, true)).toEqual([]);
  });

  it("deputy goes up to the manager only", () => {
    expect(escalationCandidates("deputy", full, true)).toEqual(["manager"]);
    expect(escalationCandidates("deputy", { deputyId: "deputy" }, true)).toEqual([]);
  });

  it("manager never escalates down to their deputy: moves up to the parent department", () => {
    expect(escalationCandidates("manager", full, true)).toEqual([]);
  });

  it("parent department: deputy then manager, whatever the approver's role below", () => {
    expect(escalationCandidates("manager", { deputyId: "pDeputy", managerId: "pManager" }, false)).toEqual(["pDeputy", "pManager"]);
  });

  it("same person as deputy and manager counts once", () => {
    expect(escalationCandidates("staff", { deputyId: "boss", managerId: "boss" }, true)).toEqual(["boss"]);
  });
});

describe("ApproverResolver.resolve — người trình là trưởng / phó phòng", () => {
  /** Phòng "d1" (gốc, không có phòng cha): trưởng phòng = head, phó phòng = deputy; mọi người đều đang hoạt động */
  const resolverWith = (manager: string, deputy?: string) =>
    new ApproverResolver({
      findOne: vi
        .fn()
        .mockResolvedValue({ id: "d1", manager: { id: manager }, deputy: deputy ? { id: deputy } : undefined, parent: undefined }),
      count: vi.fn().mockResolvedValue(1),
    } as never);

  it("mặc định bỏ người trình ra: phòng gốc không còn ai thì không tìm được người duyệt", async () => {
    const resolver = resolverWith("head");
    expect(await resolver.resolve({ type: ApproverType.DeptHead }, { requesterId: "head", departmentId: "d1" })).toEqual([]);
  });

  it("keepRequester: giữ người trình là trưởng phòng để engine bỏ qua bước", async () => {
    const resolver = resolverWith("head");
    const ctx = { requesterId: "head", departmentId: "d1", keepRequester: true };
    expect(await resolver.resolve({ type: ApproverType.DeptHead }, ctx)).toEqual(["head"]);
  });

  it("keepRequester: giữ người trình là phó phòng", async () => {
    const resolver = resolverWith("head", "deputy");
    const ctx = { requesterId: "deputy", departmentId: "d1", keepRequester: true };
    expect(await resolver.resolve({ type: ApproverType.DeptDeputy }, ctx)).toEqual(["deputy"]);
    expect(await resolver.resolve({ type: ApproverType.DeptDeputy }, { requesterId: "deputy", departmentId: "d1" })).toEqual(["head"]);
  });
});
