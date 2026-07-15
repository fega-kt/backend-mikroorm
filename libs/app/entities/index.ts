export { CategoryEntity } from "./category";
export { RequestTypeEntity, RequestTypeStatus } from "./request-type";
export {
  WorkflowSettingEntity,
  WorkflowSettingStatus,
  ApproverType,
  ApprovalType,
  SelfApproval,
  WfEndResult,
  WfNodeType,
  ConditionOperator,
} from "./workflow-setting";
export type {
  WorkflowDefinition,
  WfNode,
  WfEdge,
  WfNodeData,
  WfStartData,
  WfApprovalData,
  WfEndData,
  ApproverConfig,
  WfEdgeCondition,
  ConditionRule,
} from "./workflow-setting";

import { CategoryEntity } from "./category";
import { RequestTypeEntity } from "./request-type";
import { WorkflowSettingEntity } from "./workflow-setting";

export const appEntities = [CategoryEntity, RequestTypeEntity, WorkflowSettingEntity];
