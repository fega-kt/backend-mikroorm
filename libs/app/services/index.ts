import { CategoryService } from "./category";
import { RequestTypeService } from "./request-type";
import { FormService } from "./form";
import { HomeReportService } from "./home";
import { ApprovalEngineService } from "./approval-engine";
import { ApprovalWorkflowService } from "./approval-workflow";
import { ApprovalRequestService } from "./approval-request";
import { ApprovalTaskService } from "./approval-task";
import { ApprovalDelegationService } from "./approval-delegation";
import { EmailTemplateService } from "./email-template";

export {
  CategoryService,
  RequestTypeService,
  FormService,
  HomeReportService,
  ApprovalEngineService,
  ApprovalWorkflowService,
  ApprovalRequestService,
  ApprovalTaskService,
  ApprovalDelegationService,
  EmailTemplateService,
};

export const appServices = [
  CategoryService,
  RequestTypeService,
  FormService,
  HomeReportService,
  ApprovalEngineService,
  ApprovalWorkflowService,
  ApprovalRequestService,
  ApprovalTaskService,
  ApprovalDelegationService,
  EmailTemplateService,
];
