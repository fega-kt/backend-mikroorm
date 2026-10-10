import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { z } from "zod";
import { ActivityLogAction } from "../../entities/activity-log";
import { ActivityLogService } from "../../services/activity-log/activity-log.service";
import { activityLogFilterValidation } from "./activity-log.validation";

@Controller("activity-log")
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  /** Theo dõi activity log: ViewActivityLogAll xem toàn hệ thống, ViewActivityLogDepartment chỉ xem trong phòng ban của mình */
  @Get()
  @Permissions(PermissionType.ViewActivityLogAll, PermissionType.ViewActivityLogDepartment)
  search(@Query(new ZodValidationPipe(activityLogFilterValidation)) query: z.infer<typeof activityLogFilterValidation>) {
    return this.activityLogService.search(query);
  }

  @Get("by-parent/:parentId")
  findByParent(
    @Param("parentId") parentId: string,
    @Query("page") page = 1,
    @Query("limit") limit = 50,
    @Query("action") action?: ActivityLogAction,
  ) {
    return this.activityLogService.findByParent(parentId, Number(page), Number(limit), action);
  }
}
