import { CategoryService } from "./category";
import { RequestTypeService } from "./request-type";
import { WorkflowSettingService } from "./workflow-setting";
import { HomeReportService } from "./home";
import { WorkflowInstanceService } from "./workflow-instance";
import { WorkflowTaskService } from "./workflow-task";
import { WorkflowActionsService } from "./workflow-actions";
import { WorkflowDelegationSettingService } from "./workflow-delegation-setting";

export {
  CategoryService,
  RequestTypeService,
  WorkflowSettingService,
  HomeReportService,
  WorkflowInstanceService,
  WorkflowTaskService,
  WorkflowActionsService,
  WorkflowDelegationSettingService,
};

export const appServices = [
  CategoryService,
  RequestTypeService,
  WorkflowSettingService,
  HomeReportService,
  WorkflowInstanceService,
  WorkflowTaskService,
  WorkflowActionsService,
  WorkflowDelegationSettingService,
];
