import { describe, expect, it } from "vitest";
import { escalationCandidates } from "./approver-resolver";

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
