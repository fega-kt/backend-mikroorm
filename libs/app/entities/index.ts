export { CategoryEntity } from "./category";
export { RequestTypeEntity, RequestTypeStatus } from "./request-type";
export { ApprovalWorkflowEntity } from "./approval-workflow";
export { ApprovalWorkflowVersionEntity, ApprovalWorkflowVersionStatus } from "./approval-workflow-version";
export { ApprovalPriority, ApprovalRequestEntity, ApprovalRequestStatus } from "./approval-request";
export { ApprovalTaskEntity, ApprovalTaskStatus } from "./approval-task";
export { ApprovalHistoryEntity, ApprovalHistoryAction } from "./approval-history";
export { ApprovalDelegationEntity } from "./approval-delegation";
export { ApprovalCounterEntity } from "./approval-counter";

import { CategoryEntity } from "./category";
import { RequestTypeEntity } from "./request-type";
import { ApprovalWorkflowEntity } from "./approval-workflow";
import { ApprovalWorkflowVersionEntity } from "./approval-workflow-version";
import { ApprovalRequestEntity } from "./approval-request";
import { ApprovalTaskEntity } from "./approval-task";
import { ApprovalHistoryEntity } from "./approval-history";
import { ApprovalDelegationEntity } from "./approval-delegation";
import { ApprovalCounterEntity } from "./approval-counter";

export const appEntities = [
  CategoryEntity,
  RequestTypeEntity,
  ApprovalWorkflowEntity,
  ApprovalWorkflowVersionEntity,
  ApprovalRequestEntity,
  ApprovalTaskEntity,
  ApprovalHistoryEntity,
  ApprovalDelegationEntity,
  ApprovalCounterEntity,
];
