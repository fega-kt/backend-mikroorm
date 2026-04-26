import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { TimeLogService } from "../service/timelog.service";
import {
  createTimeLogValidation,
  reviewTimeLogValidation,
  timelogFilterValidation,
  updateTimeLogValidation,
} from "../validation/timelog.validation";

@Controller("timelog")
export class TimeLogController {
  constructor(private readonly timelogService: TimeLogService) {}

  @Post()
  @Permissions(PermissionType.CreateTimeLog)
  create(@Body(new ZodValidationPipe(createTimeLogValidation)) data: z.infer<typeof createTimeLogValidation>) {
    return this.timelogService.createTimeLog(data);
  }

  @Get("by-task/:taskId")
  @Permissions(PermissionType.ViewTimeLog)
  findByTask(
    @Param("taskId") taskId: string,
    @Query(new ZodValidationPipe(timelogFilterValidation)) query: z.infer<typeof timelogFilterValidation>,
  ) {
    return this.timelogService.getTimeLogsByTask(taskId, query);
  }

  @Get("by-task/:taskId/summary")
  @Permissions(PermissionType.ViewTimeLog)
  getSummary(@Param("taskId") taskId: string) {
    return this.timelogService.getSummaryByTask(taskId);
  }

  @Patch(":id/review")
  @Permissions(PermissionType.ApproveTimeLog)
  review(@Param("id") id: string, @Body(new ZodValidationPipe(reviewTimeLogValidation)) data: z.infer<typeof reviewTimeLogValidation>) {
    return this.timelogService.reviewTimeLog(id, data);
  }

  @Patch(":id")
  @Permissions(PermissionType.CreateTimeLog)
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateTimeLogValidation)) data: z.infer<typeof updateTimeLogValidation>) {
    return this.timelogService.updateTimeLog(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteTimeLog)
  remove(@Param("id") id: string) {
    return this.timelogService.deleteTimeLog(id);
  }
}
