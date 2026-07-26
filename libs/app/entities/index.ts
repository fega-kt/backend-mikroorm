export { CategoryEntity } from "./category";
export { RequestTypeEntity, RequestTypeStatus } from "./request-type";
export { WorkflowSettingEntity, WorkflowSettingStatus, ApproverType, ApprovalType, SelfApproval } from "./workflow-setting";
export type { WfApprovalData, ApproverConfig } from "./workflow-setting";
export { WorkflowInstanceEntity, WorkflowInstanceStatus } from "./workflow-instance";
export { WorkflowTaskEntity, WorkflowTaskStatus } from "./workflow-task";
export { WorkflowActionEntity, WorkflowActionType } from "./workflow-action";
export { WorkflowDelegationSettingEntity } from "./workflow-delegation-setting";

import { CategoryEntity } from "./category";
import { RequestTypeEntity } from "./request-type";
import { WorkflowSettingEntity } from "./workflow-setting";
import { WorkflowInstanceEntity } from "./workflow-instance";
import { WorkflowTaskEntity } from "./workflow-task";
import { WorkflowActionEntity } from "./workflow-action";
import { WorkflowDelegationSettingEntity } from "./workflow-delegation-setting";

export const appEntities = [
  CategoryEntity,
  RequestTypeEntity,
  WorkflowSettingEntity,
  WorkflowInstanceEntity,
  WorkflowTaskEntity,
  WorkflowActionEntity,
  WorkflowDelegationSettingEntity,
];
