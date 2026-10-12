import { CategoryController } from "./category";
import { RequestTypeController } from "./request-type";
import { HomeReportController } from "./home";
import { ApprovalWorkflowController } from "./approval-workflow";
import { ApprovalRequestController } from "./approval-request";
import { ApprovalTaskController } from "./approval-task";
import { ApprovalDelegationController } from "./approval-delegation";
import { EmailTemplateController } from "./email-template";

export {
  CategoryController,
  RequestTypeController,
  HomeReportController,
  ApprovalWorkflowController,
  ApprovalRequestController,
  ApprovalTaskController,
  ApprovalDelegationController,
  EmailTemplateController,
};

export const appControllers = [
  CategoryController,
  RequestTypeController,
  HomeReportController,
  ApprovalWorkflowController,
  ApprovalRequestController,
  ApprovalTaskController,
  ApprovalDelegationController,
  EmailTemplateController,
];
