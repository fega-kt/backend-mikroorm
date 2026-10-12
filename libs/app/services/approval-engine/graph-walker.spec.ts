import { describe, expect, it } from "vitest";
import { leaveWorkflow } from "./__fixtures__/leave-workflow";
import { workflowDefinitionSchema } from "./definition.schema";
import { GraphWalkError, findStartNode, walkFrom } from "./graph-walker";

describe("graph-walker", () => {
  const def = leaveWorkflow();

  it("goes from start to the first approval step", () => {
    const result = walkFrom(def, findStartNode(def).id, { days: 5 });
    expect(result.type).toBe("wait");
    expect(result.node.id).toBe("n1");
    expect(result.path).toEqual(["n1"]);
  });

  it("takes the matching condition branch", () => {
    const result = walkFrom(def, "n1", { days: 5 });
    expect(result.node.id).toBe("n2");
    expect(result.path).toEqual(["c1", "n2"]);
    expect(result.notifies).toEqual([]);
  });

  it("falls back to the default branch and collects notify nodes", () => {
    const result = walkFrom(def, "n1", { days: 2 });
    expect(result.node.id).toBe("p1");
    expect(result.path).toEqual(["c1", "notify1", "p1"]);
    expect(result.notifies.map((n) => n.id)).toEqual(["notify1"]);
  });

  it("treats a missing payload field as false", () => {
    expect(walkFrom(def, "n1", {}).node.id).toBe("p1");
  });

  it("stops at a parallel node", () => {
    const result = walkFrom(def, "n2", { days: 5 });
    expect(result.type).toBe("wait");
    expect(result.node.type).toBe("parallel");
  });

  it("reaches the end node", () => {
    const result = walkFrom(def, "p1", {});
    expect(result).toMatchObject({ type: "end", path: ["end"] });
  });

  it("throws on a loop", () => {
    const loop = workflowDefinitionSchema.parse({
      nodes: [
        { id: "start", type: "start" },
        { id: "a", type: "notify" },
        { id: "b", type: "notify" },
      ],
      edges: [
        { from: "start", to: "a" },
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    });
    expect(() => walkFrom(loop, "start", {})).toThrow(GraphWalkError);
  });

  it("throws when a condition has no usable edge", () => {
    const broken = workflowDefinitionSchema.parse({
      nodes: [
        { id: "start", type: "start" },
        { id: "c", type: "condition" },
        { id: "end", type: "end" },
      ],
      edges: [
        { from: "start", to: "c" },
        { from: "c", to: "end", condition: { "==": [1, 2] } },
      ],
    });
    expect(() => walkFrom(broken, "start", {})).toThrow(GraphWalkError);
  });
});
