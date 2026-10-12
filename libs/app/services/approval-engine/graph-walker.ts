import jsonLogic from "json-logic-js";
import {
  NodeType,
  isWaitNode,
  type NotifyNode,
  type WaitNode,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowNode,
} from "./definition.schema";

export type WalkResult =
  | { type: "wait"; node: WaitNode; path: string[]; notifies: NotifyNode[] }
  | { type: "end"; node: WorkflowNode; path: string[]; notifies: NotifyNode[] };

export class GraphWalkError extends Error {}

export function findStartNode(definition: WorkflowDefinition): WorkflowNode {
  const start = definition.nodes.find((n) => n.type === NodeType.Start);
  if (!start) throw new GraphWalkError("Workflow has no start node");
  return start;
}

/** Chọn cạnh ra của node condition: cạnh đầu tiên có điều kiện đúng, không có thì cạnh default */
export function pickConditionEdge(edges: WorkflowEdge[], data: Record<string, unknown>): WorkflowEdge | undefined {
  const matched = edges.find((e) => !e.default && e.condition && jsonLogic.apply(e.condition as jsonLogic.RulesLogic, data));
  return matched ?? edges.find((e) => e.default);
}

/**
 * Hàm thuần: đi tiếp graph từ sau node `fromNodeId` cho tới node chờ duyệt kế tiếp hoặc node end.
 * Node notify được gom vào `notifies` để engine phát event. Engine tự xử lý bỏ qua bước
 * (skipIfRequester) bằng cách gọi lại hàm này với id của bước bị bỏ qua.
 */
export function walkFrom(definition: WorkflowDefinition, fromNodeId: string, payload: Record<string, unknown>): WalkResult {
  const nodeById = new Map(definition.nodes.map((n) => [n.id, n]));
  const data = { payload };
  const path: string[] = [];
  const notifies: NotifyNode[] = [];

  let current = nodeById.get(fromNodeId);
  if (!current) throw new GraphWalkError(`Node "${fromNodeId}" not found`);

  for (let step = 0; step <= definition.nodes.length; step++) {
    const outs = definition.edges.filter((e) => e.from === current.id);
    const edge = current.type === NodeType.Condition ? pickConditionEdge(outs, data) : outs[0];
    if (!edge) throw new GraphWalkError(`Node "${current.id}" has no usable outgoing edge`);

    const next = nodeById.get(edge.to);
    if (!next) throw new GraphWalkError(`Node "${edge.to}" not found`);
    path.push(next.id);

    if (isWaitNode(next)) return { type: "wait", node: next, path, notifies };
    if (next.type === NodeType.End) return { type: "end", node: next, path, notifies };
    if (next.type === NodeType.Notify) notifies.push(next);
    current = next;
  }

  throw new GraphWalkError("Workflow contains a loop");
}
