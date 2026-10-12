import { CategoryService } from "./category";
import { RequestTypeService } from "./request-type";
import { HomeReportService } from "./home";
import { ApprovalEngineService, ApprovalEventsPublisher } from "./approval-engine";
import { ApprovalWorkflowService } from "./approval-workflow";
import { ApprovalRequestService } from "./approval-request";
import { ApprovalTaskService } from "./approval-task";
import { ApprovalDelegationService } from "./approval-delegation";

export {
  CategoryService,
  RequestTypeService,
  HomeReportService,
  ApprovalEngineService,
  ApprovalEventsPublisher,
  ApprovalWorkflowService,
  ApprovalRequestService,
  ApprovalTaskService,
  ApprovalDelegationService,
};

export const appServices = [
  CategoryService,
  RequestTypeService,
  HomeReportService,
  ApprovalEngineService,
  ApprovalEventsPublisher,
  ApprovalWorkflowService,
  ApprovalRequestService,
  ApprovalTaskService,
  ApprovalDelegationService,
];
