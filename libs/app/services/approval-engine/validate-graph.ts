import {
  ApproverType,
  NodeType,
  notifiesRequester,
  OverdueAction,
  type Approver,
  type WorkflowDefinition,
  type WorkflowEdge,
} from "./definition.schema";

export enum GraphErrorCode {
  DuplicateNodeId = "DUPLICATE_NODE_ID",
  UnknownEdgeNode = "UNKNOWN_EDGE_NODE",
  StartCount = "START_COUNT",
  NoEnd = "NO_END",
  StartHasIncoming = "START_HAS_INCOMING",
  EndHasOutgoing = "END_HAS_OUTGOING",
  Unreachable = "UNREACHABLE",
  DeadEnd = "DEAD_END",
  Cycle = "CYCLE",
  SingleOutgoing = "SINGLE_OUTGOING",
  ConditionOutgoing = "CONDITION_OUTGOING",
  ConditionDefault = "CONDITION_DEFAULT",
  EdgeMissingCondition = "EDGE_MISSING_CONDITION",
  EdgeConditionOutsideBranch = "EDGE_CONDITION_OUTSIDE_BRANCH",
  MissingApprover = "MISSING_APPROVER",
  ParallelApprovers = "PARALLEL_APPROVERS",
  UnknownField = "UNKNOWN_FIELD",
  SlaRequired = "SLA_REQUIRED",
  NotifyNoRecipient = "NOTIFY_NO_RECIPIENT",
  /** Chỉ backend kiểm tra (cần DB) */
  InactiveUser = "INACTIVE_USER",
}

export interface GraphError {
  code: GraphErrorCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export const edgeKey = (edge: WorkflowEdge) => edge.id ?? `${edge.from}->${edge.to}`;

/** Lấy tên các trường payload mà biểu thức json-logic tham chiếu ({ var: "payload.x" } → "x") */
export function collectPayloadVars(logic: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(logic)) {
    logic.forEach((item) => collectPayloadVars(item, out));
  } else if (logic && typeof logic === "object") {
    for (const [op, arg] of Object.entries(logic)) {
      if (op === "var") {
        const path = Array.isArray(arg) ? arg[0] : arg;
        if (typeof path === "string") out.add(path);
      } else {
        collectPayloadVars(arg, out);
      }
    }
  }
  return out;
}

const approverKey = (a: Approver) =>
  a.type === ApproverType.SpecificUser
    ? `${a.type}:${a.userId}`
    : a.type === ApproverType.Principal
      ? `${a.type}:${a.principalId}`
      : a.type;

/**
 * Kiểm tra graph trước khi xuất bản. Backend là nguồn chuẩn; FE có bản sao để báo lỗi tức thì trên canvas.
 * @param formFields key các trường trong formSchema của loại đơn — bỏ qua quy tắc 6 nếu không truyền
 */
export function validateGraph(definition: WorkflowDefinition, formFields?: string[]): GraphError[] {
  const errors: GraphError[] = [];
  const { nodes, edges } = definition;

  const nodeById = new Map<string, (typeof nodes)[number]>();
  for (const node of nodes) {
    if (nodeById.has(node.id)) {
      errors.push({ code: GraphErrorCode.DuplicateNodeId, message: `Duplicate node id "${node.id}"`, nodeId: node.id });
    }
    nodeById.set(node.id, node);
  }

  const outgoing = new Map<string, WorkflowEdge[]>();
  const incoming = new Map<string, WorkflowEdge[]>();
  for (const node of nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
      errors.push({ code: GraphErrorCode.UnknownEdgeNode, message: "Edge points to a missing node", edgeId: edgeKey(edge) });
      continue;
    }
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  }

  // 1. Đúng một start, ít nhất một end
  const starts = nodes.filter((n) => n.type === NodeType.Start);
  const ends = nodes.filter((n) => n.type === NodeType.End);
  if (starts.length !== 1) {
    errors.push({ code: GraphErrorCode.StartCount, message: "Workflow must have exactly one start node" });
  }
  if (ends.length === 0) {
    errors.push({ code: GraphErrorCode.NoEnd, message: "Workflow must have at least one end node" });
  }

  for (const node of nodes) {
    const outs = outgoing.get(node.id);
    if (node.type === NodeType.Start && incoming.get(node.id).length) {
      errors.push({ code: GraphErrorCode.StartHasIncoming, message: "Start node cannot have incoming edges", nodeId: node.id });
    }
    if (node.type === NodeType.End) {
      if (outs.length) {
        errors.push({ code: GraphErrorCode.EndHasOutgoing, message: "End node cannot have outgoing edges", nodeId: node.id });
      }
      continue;
    }

    // 4. Node condition: ≥ 2 cạnh ra, đúng một cạnh default, các cạnh còn lại phải có điều kiện
    if (node.type === NodeType.Condition) {
      if (outs.length < 2) {
        errors.push({ code: GraphErrorCode.ConditionOutgoing, message: "Condition needs at least 2 outgoing edges", nodeId: node.id });
      }
      const defaults = outs.filter((e) => e.default);
      if (defaults.length !== 1) {
        errors.push({ code: GraphErrorCode.ConditionDefault, message: "Condition needs exactly one default edge", nodeId: node.id });
      }
      for (const edge of outs) {
        if (!edge.default && !edge.condition) {
          errors.push({
            code: GraphErrorCode.EdgeMissingCondition,
            message: "Non-default branch needs a condition",
            nodeId: node.id,
            edgeId: edgeKey(edge),
          });
        }
      }
    } else {
      if (outs.length !== 1) {
        errors.push({ code: GraphErrorCode.SingleOutgoing, message: "Step must have exactly one outgoing edge", nodeId: node.id });
      }
      for (const edge of outs) {
        if (edge.condition || edge.default) {
          errors.push({
            code: GraphErrorCode.EdgeConditionOutsideBranch,
            message: "Only edges leaving a condition node can have a condition",
            edgeId: edgeKey(edge),
          });
        }
      }
    }

    // 5. Bước duyệt phải có người duyệt; duyệt song song ≥ 2 người khác nhau
    if (node.type === NodeType.Approval && !node.approver) {
      errors.push({ code: GraphErrorCode.MissingApprover, message: "Approval step needs an approver", nodeId: node.id });
    }
    if ((node.type === NodeType.Approval || node.type === NodeType.Parallel) && node.onOverdue !== OverdueAction.Remind && !node.slaHours) {
      errors.push({ code: GraphErrorCode.SlaRequired, message: "Overdue handling needs an SLA", nodeId: node.id });
    }
    if (node.type === NodeType.Notify && !notifiesRequester(node) && !node.notifyNextApprovers && !node.recipients.length) {
      errors.push({ code: GraphErrorCode.NotifyNoRecipient, message: "Notification step needs at least one recipient", nodeId: node.id });
    }
    if (node.type === NodeType.Parallel && new Set(node.approvers.map(approverKey)).size < 2) {
      errors.push({
        code: GraphErrorCode.ParallelApprovers,
        message: "Parallel step needs at least 2 different approvers",
        nodeId: node.id,
      });
    }
  }

  // 2. Mọi node đi được từ start và đi tới được một end
  if (starts.length === 1) {
    const reachable = walk([starts[0].id], (id) => outgoing.get(id).map((e) => e.to));
    const canFinish = walk(
      ends.map((n) => n.id),
      (id) => incoming.get(id).map((e) => e.from),
    );
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        errors.push({ code: GraphErrorCode.Unreachable, message: "Step is not reachable from start", nodeId: node.id });
      } else if (!canFinish.has(node.id)) {
        errors.push({ code: GraphErrorCode.DeadEnd, message: "Step cannot reach an end node", nodeId: node.id });
      }
    }
  }

  // 3. Không có vòng lặp
  for (const nodeId of findCycleNodes(
    nodes.map((n) => n.id),
    outgoing,
  )) {
    errors.push({ code: GraphErrorCode.Cycle, message: "Step is part of a loop", nodeId });
  }

  // 6. Điều kiện chỉ tham chiếu trường có trong formSchema
  if (formFields) {
    const known = new Set(formFields.map((f) => `payload.${f}`));
    for (const edge of edges) {
      if (!edge.condition) continue;
      for (const path of collectPayloadVars(edge.condition)) {
        if (!known.has(path)) {
          errors.push({
            code: GraphErrorCode.UnknownField,
            message: `Condition uses unknown field "${path}"`,
            nodeId: edge.from,
            edgeId: edgeKey(edge),
          });
        }
      }
    }
  }

  return errors;
}

function walk(seeds: string[], next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>(seeds);
  const stack = [...seeds];
  while (stack.length) {
    for (const id of next(stack.pop())) {
      if (!seen.has(id)) {
        seen.add(id);
        stack.push(id);
      }
    }
  }
  return seen;
}

/** DFS 3 màu, trả về các node nằm trên cạnh quay lui (đủ để đánh dấu lỗi trên canvas) */
function findCycleNodes(ids: string[], outgoing: Map<string, WorkflowEdge[]>): Set<string> {
  const color = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0]));
  const result = new Set<string>();
  const visit = (id: string, path: string[]) => {
    color.set(id, 1);
    path.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      const state = color.get(edge.to);
      if (state === 1) {
        path.slice(path.indexOf(edge.to)).forEach((n) => result.add(n));
      } else if (state === 0) {
        visit(edge.to, path);
      }
    }
    path.pop();
    color.set(id, 2);
  };
  for (const id of ids) if (color.get(id) === 0) visit(id, []);
  return result;
}
