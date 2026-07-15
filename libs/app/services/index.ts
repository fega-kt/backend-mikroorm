import { CategoryService } from "./category";
import { RequestTypeService } from "./request-type";
import { WorkflowSettingService } from "./workflow-setting";
import { HomeReportService } from "./home";

export { CategoryService, RequestTypeService, WorkflowSettingService, HomeReportService };

export const appServices = [CategoryService, RequestTypeService, WorkflowSettingService, HomeReportService];
