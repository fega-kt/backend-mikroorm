import { describe, expect, it, vi } from "vitest";
import { ApproverResolver, escalationCandidates } from "./approver-resolver";
import { approverSchema, ApproverType, LeaderRole, stepOptionsSchema } from "./definition.schema";

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

describe("ApproverResolver — lãnh đạo phòng cụ thể (DEPARTMENT_LEADER)", () => {
  /** Cây phòng: "kt" (Kế toán, cha = "bgd"), "empty" (không có ai, cha = "bgd"), "bgd" (Ban giám đốc, gốc) */
  const departments: Record<string, { id: string; manager?: { id: string }; deputy?: { id: string }; parent?: { id: string } }> = {
    kt: { id: "kt", manager: { id: "kt-head" }, deputy: { id: "kt-deputy" }, parent: { id: "bgd" } },
    empty: { id: "empty", parent: { id: "bgd" } },
    bgd: { id: "bgd", manager: { id: "ceo" } },
  };
  const em = {
    findOne: vi.fn(async (entity: { name: string }, where: { id?: string; user?: string }) => {
      if (entity.name === "DepartmentEntity") return departments[where.id ?? ""] ?? null;
      if (entity.name === "PrincipalEntity") return where.user ? { id: `p-${where.user}` } : null;
      return null;
    }),
    count: vi.fn().mockResolvedValue(1),
  };
  const ctx = { requesterId: "someone", departmentId: "other" };
  const leader = (departmentId: string, role: LeaderRole, climbIfEmpty = false) =>
    ({ type: ApproverType.DepartmentLeader, departmentId, role, climbIfEmpty }) as const;

  it("trưởng / phó / cả hai của đúng phòng được chọn, không phụ thuộc phòng của tờ trình", async () => {
    const resolver = new ApproverResolver(em as never);
    expect(await resolver.resolve(leader("kt", LeaderRole.Head), ctx)).toEqual(["kt-head"]);
    expect(await resolver.resolve(leader("kt", LeaderRole.Deputy), ctx)).toEqual(["kt-deputy"]);
    expect(await resolver.resolve(leader("kt", LeaderRole.HeadOrDeputy), ctx)).toEqual(["kt-head", "kt-deputy"]);
  });

  it("phòng trống: mặc định không leo lên, bật climbIfEmpty thì lấy lãnh đạo phòng cấp cha", async () => {
    const resolver = new ApproverResolver(em as never);
    expect(await resolver.resolve(leader("empty", LeaderRole.Head), ctx)).toEqual([]);
    expect(await resolver.resolve(leader("empty", LeaderRole.Head, true), ctx)).toEqual(["ceo"]);
  });

  it("người trình là lãnh đạo phòng được chọn: vẫn được giữ (bỏ qua hay không do tùy chọn của bước)", async () => {
    const resolver = new ApproverResolver(em as never);
    const requesterIsHead = { requesterId: "kt-head", departmentId: "kt" };
    expect(await resolver.resolve(leader("kt", LeaderRole.Head), requesterIsHead)).toEqual(["kt-head"]);
    expect(await resolver.resolve(leader("kt", LeaderRole.HeadOrDeputy), requesterIsHead)).toEqual(["kt-head", "kt-deputy"]);
    const requesterIsDeputy = { requesterId: "kt-deputy", departmentId: "kt" };
    expect(await resolver.resolve(leader("kt", LeaderRole.Deputy), requesterIsDeputy)).toEqual(["kt-deputy"]);
  });

  it("trưởng hoặc phó: một suất gồm hai người, mỗi người kèm principal riêng", async () => {
    const resolver = new ApproverResolver(em as never);
    const [slot] = await resolver.resolveSlotTargets([leader("kt", LeaderRole.HeadOrDeputy)], ctx);
    expect(slot.group).toBe(false);
    expect(slot.members).toEqual([
      { userId: "kt-head", principalId: "p-kt-head" },
      { userId: "kt-deputy", principalId: "p-kt-deputy" },
    ]);
  });
});

describe("approverSchema — DEPARTMENT_LEADER", () => {
  it("giữ tên phòng để hiển thị và mặc định không leo lên phòng cấp trên", () => {
    const parsed = approverSchema.parse({
      type: ApproverType.DepartmentLeader,
      departmentId: "kt",
      departmentName: "Kế toán",
      role: LeaderRole.HeadOrDeputy,
    });
    expect(parsed).toEqual({
      type: ApproverType.DepartmentLeader,
      departmentId: "kt",
      departmentName: "Kế toán",
      role: LeaderRole.HeadOrDeputy,
      climbIfEmpty: false,
    });
  });
});

describe("stepOptionsSchema — autoExcludeRequester", () => {
  it("bước lưu trước khi có cờ giữ quy tắc cũ (tự bỏ người trình), bước mới ghi false thì làm theo skipIfRequester", () => {
    expect(stepOptionsSchema.parse({}).autoExcludeRequester).toBe(true);
    expect(stepOptionsSchema.parse({ autoExcludeRequester: false }).autoExcludeRequester).toBe(false);
  });
});
