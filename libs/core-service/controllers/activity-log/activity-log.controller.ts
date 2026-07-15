import { Controller, Get, Param, Query } from "@nestjs/common";
import { ActivityLogAction } from "../../entities/activity-log";
import { ActivityLogService } from "../../services/activity-log/activity-log.service";

@Controller("activity-log")
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

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
