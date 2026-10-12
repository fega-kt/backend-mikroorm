import { describe, expect, it } from "vitest";
import { leaveWorkflow } from "./__fixtures__/leave-workflow";
import { NodeType, type WorkflowDefinition } from "./definition.schema";
import { GraphErrorCode, collectPayloadVars, validateGraph } from "./validate-graph";

const codes = (def: WorkflowDefinition, fields?: string[]) => validateGraph(def, fields).map((e) => e.code);

describe("validate-graph", () => {
  it("accepts the leave workflow", () => {
    expect(validateGraph(leaveWorkflow(), ["days", "reason"])).toEqual([]);
  });

  it("rule 1: exactly one start and at least one end", () => {
    const noStart = leaveWorkflow();
    noStart.nodes = noStart.nodes.filter((n) => n.id !== "start");
    noStart.edges = noStart.edges.filter((e) => e.from !== "start");
    expect(codes(noStart)).toContain(GraphErrorCode.StartCount);

    const noEnd = leaveWorkflow();
    noEnd.nodes = noEnd.nodes.filter((n) => n.id !== "end");
    noEnd.edges = noEnd.edges.filter((e) => e.to !== "end");
    expect(codes(noEnd)).toContain(GraphErrorCode.NoEnd);
  });

  it("rule 2: unreachable and dead-end steps", () => {
    const def = leaveWorkflow();
    def.nodes.push({ id: "orphan", type: NodeType.Notify, channels: [], recipients: [] } as never);
    def.edges.push({ from: "orphan", to: "end" });
    const errors = validateGraph(def);
    expect(errors).toContainEqual(expect.objectContaining({ code: GraphErrorCode.Unreachable, nodeId: "orphan" }));

    const deadEnd = leaveWorkflow();
    deadEnd.edges = deadEnd.edges.filter((e) => e.from !== "p1");
    expect(validateGraph(deadEnd)).toContainEqual(expect.objectContaining({ code: GraphErrorCode.DeadEnd, nodeId: "p1" }));
  });

  it("rule 3: no loops", () => {
    const def = leaveWorkflow();
    def.edges = def.edges.filter((e) => e.from !== "n2");
    def.edges.push({ from: "n2", to: "n1" });
    expect(codes(def)).toContain(GraphErrorCode.Cycle);
  });

  it("rule 4: condition needs 2 outgoing edges and exactly one default", () => {
    const one = leaveWorkflow();
    one.edges = one.edges.filter((e) => !(e.from === "c1" && e.to === "n2"));
    expect(codes(one)).toContain(GraphErrorCode.ConditionOutgoing);

    const noDefault = leaveWorkflow();
    noDefault.edges.find((e) => e.default).default = false;
    expect(codes(noDefault)).toEqual(expect.arrayContaining([GraphErrorCode.ConditionDefault, GraphErrorCode.EdgeMissingCondition]));
  });

  it("rule 5: approvers are required", () => {
    const def = leaveWorkflow();
    const n1 = def.nodes.find((n) => n.id === "n1");
    if (n1.type === NodeType.Approval) n1.approver = null;
    const p1 = def.nodes.find((n) => n.id === "p1");
    if (p1.type === NodeType.Parallel) p1.approvers = [p1.approvers[0], p1.approvers[0]];
    expect(codes(def)).toEqual(expect.arrayContaining([GraphErrorCode.MissingApprover, GraphErrorCode.ParallelApprovers]));
  });

  it("rule 6: conditions only use form fields", () => {
    expect(validateGraph(leaveWorkflow(), ["reason"])).toContainEqual(
      expect.objectContaining({ code: GraphErrorCode.UnknownField, edgeId: "c1->n2" }),
    );
  });

  it("non-branch steps have exactly one outgoing edge", () => {
    const def = leaveWorkflow();
    def.edges.push({ from: "n1", to: "p1" });
    expect(codes(def)).toContain(GraphErrorCode.SingleOutgoing);
  });

  it("collects nested payload vars", () => {
    const vars = collectPayloadVars({ and: [{ ">": [{ var: "payload.days" }, 3] }, { in: [{ var: ["payload.kind", ""] }, ["a"]] }] });
    expect([...vars]).toEqual(["payload.days", "payload.kind"]);
  });
});
