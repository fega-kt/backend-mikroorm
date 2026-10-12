import { CategoryController } from "./category";
import { RequestTypeController } from "./request-type";
import { HomeReportController } from "./home";
import { ApprovalWorkflowController } from "./approval-workflow";
import { ApprovalRequestController } from "./approval-request";
import { ApprovalTaskController } from "./approval-task";
import { ApprovalDelegationController } from "./approval-delegation";

export {
  CategoryController,
  RequestTypeController,
  HomeReportController,
  ApprovalWorkflowController,
  ApprovalRequestController,
  ApprovalTaskController,
  ApprovalDelegationController,
};

export const appControllers = [
  CategoryController,
  RequestTypeController,
  HomeReportController,
  ApprovalWorkflowController,
  ApprovalRequestController,
  ApprovalTaskController,
  ApprovalDelegationController,
];
