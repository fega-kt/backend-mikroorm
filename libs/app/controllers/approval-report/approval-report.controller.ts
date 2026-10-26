import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Controller, Get, Query } from "@nestjs/common";
import { ApprovalReportService } from "../../services/approval-report/approval-report.service";
import { type ReportRangeDto, type ReportScopeDto, reportRangeValidation, reportScopeValidation } from "./approval-report.validation";

/** Báo cáo tờ trình: ViewApprovalReportAll xem toàn hệ thống, ViewApprovalReportDepartment chỉ phòng ban của mình và phòng con */
@Controller("approval-report")
@Permissions(PermissionType.ViewApprovalReportAll, PermissionType.ViewApprovalReportDepartment)
export class ApprovalReportController {
  constructor(private readonly reportService: ApprovalReportService) {}

  /** Dữ liệu cho bộ lọc: phạm vi được xem và danh sách loại tờ trình */
  @Get("filters")
  filters() {
    return this.reportService.getFilters();
  }

  @Get("overview")
  overview(@Query(new ZodValidationPipe(reportRangeValidation)) query: ReportRangeDto) {
    return this.reportService.getOverview(query);
  }

  @Get("performance")
  performance(@Query(new ZodValidationPipe(reportRangeValidation)) query: ReportRangeDto) {
    return this.reportService.getPerformance(query);
  }

  @Get("backlog")
  backlog(@Query(new ZodValidationPipe(reportScopeValidation)) query: ReportScopeDto) {
    return this.reportService.getBacklog(query);
  }

  @Get("request-types")
  requestTypes(@Query(new ZodValidationPipe(reportRangeValidation)) query: ReportRangeDto) {
    return this.reportService.getRequestTypes(query);
  }
}
