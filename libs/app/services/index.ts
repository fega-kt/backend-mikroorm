import { CategoryService } from "./category";
import { RequestTypeService } from "./request-type";
import { HomeReportService } from "./home";
import { ApprovalEngineService, ApprovalEventsPublisher } from "./approval-engine";
import { ApprovalWorkflowService } from "./approval-workflow";
import { ApprovalRequestService } from "./approval-request";
import { ApprovalTaskService } from "./approval-task";
import { ApprovalDelegationService } from "./approval-delegation";
import { EmailTemplateService } from "./email-template";

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
  EmailTemplateService,
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
  EmailTemplateService,
];
