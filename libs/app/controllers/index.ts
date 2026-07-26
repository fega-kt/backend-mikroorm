import { CategoryController } from "./category";
import { RequestTypeController } from "./request-type";
import { WorkflowSettingController } from "./workflow-setting";
import { HomeReportController } from "./home";
import { WorkflowInstanceController } from "./workflow-instance";
import { WorkflowTaskController } from "./workflow-task";
import { WorkflowActionsController } from "./workflow-actions";
import { WorkflowCallbackController } from "./workflow-callback";
import { WorkflowDelegationSettingController } from "./workflow-delegation-setting";

export {
  CategoryController,
  RequestTypeController,
  WorkflowSettingController,
  HomeReportController,
  WorkflowInstanceController,
  WorkflowTaskController,
  WorkflowActionsController,
  WorkflowCallbackController,
  WorkflowDelegationSettingController,
};

export const appControllers = [
  CategoryController,
  RequestTypeController,
  WorkflowSettingController,
  HomeReportController,
  WorkflowInstanceController,
  WorkflowTaskController,
  WorkflowActionsController,
  WorkflowCallbackController,
  WorkflowDelegationSettingController,
];
