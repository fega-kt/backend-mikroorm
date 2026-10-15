export { CategoryEntity } from "./category";
export { RequestTypeEntity, RequestTypeStatus } from "./request-type";
export { RequestTypeVersionEntity } from "./request-type-version";
export { FormEntity } from "./form";
export { FormVersionEntity } from "./form-version";
export { ApprovalWorkflowEntity } from "./approval-workflow";
export { ApprovalWorkflowVersionEntity, ApprovalWorkflowVersionStatus } from "./approval-workflow-version";
export { ApprovalPriority, ApprovalRequestEntity, ApprovalRequestStatus } from "./approval-request";
export { ApprovalTaskEntity, ApprovalTaskStatus } from "./approval-task";
export { ApprovalHistoryEntity, ApprovalHistoryAction } from "./approval-history";
export { ApprovalDelegationEntity, ApprovalDelegationMode } from "./approval-delegation";
export { ApprovalShareEntity } from "./approval-share";
export { ApprovalCounterEntity } from "./approval-counter";
export { EmailTemplateEntity } from "./email-template";

import { CategoryEntity } from "./category";
import { RequestTypeEntity } from "./request-type";
import { RequestTypeVersionEntity } from "./request-type-version";
import { FormEntity } from "./form";
import { FormVersionEntity } from "./form-version";
import { ApprovalWorkflowEntity } from "./approval-workflow";
import { ApprovalWorkflowVersionEntity } from "./approval-workflow-version";
import { ApprovalRequestEntity } from "./approval-request";
import { ApprovalTaskEntity } from "./approval-task";
import { ApprovalHistoryEntity } from "./approval-history";
import { ApprovalDelegationEntity } from "./approval-delegation";
import { ApprovalShareEntity } from "./approval-share";
import { ApprovalCounterEntity } from "./approval-counter";
import { EmailTemplateEntity } from "./email-template";

export const appEntities = [
  CategoryEntity,
  RequestTypeEntity,
  RequestTypeVersionEntity,
  FormEntity,
  FormVersionEntity,
  ApprovalWorkflowEntity,
  ApprovalWorkflowVersionEntity,
  ApprovalRequestEntity,
  ApprovalTaskEntity,
  ApprovalHistoryEntity,
  ApprovalDelegationEntity,
  ApprovalShareEntity,
  ApprovalCounterEntity,
  EmailTemplateEntity,
];
