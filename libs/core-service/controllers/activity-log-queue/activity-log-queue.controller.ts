import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ActivityLogQueueService } from "../../services/activity-log-queue/activity-log-queue.service";
import { activityLogQueueFilterValidation } from "./activity-log-queue.validation";

@Controller("activity-log-queue")
export class ActivityLogQueueController {
  constructor(private readonly service: ActivityLogQueueService) {}

  @Get()
  @Permissions(PermissionType.ViewActivityLogQueue)
  findAll(@Query(new ZodValidationPipe(activityLogQueueFilterValidation)) query: z.infer<typeof activityLogQueueFilterValidation>) {
    return this.service.findAll(query.page, query.limit, query.status);
  }

  @Post(":id/retry")
  @Permissions(PermissionType.RetryActivityLogQueue)
  async retry(@Param("id") id: string) {
    try {
      await this.service.retry(id);
      return { success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error };
    }
  }
}
