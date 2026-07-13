import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { ActivityLogQueueStatus } from "../entity/activity-log-queue.entity";
import { ActivityLogQueueService } from "../service/activity-log-queue.service";

const filterValidation = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.nativeEnum(ActivityLogQueueStatus).optional(),
});

@Controller("activity-log-queue")
export class ActivityLogQueueController {
  constructor(private readonly service: ActivityLogQueueService) {}

  @Get()
  @Permissions(PermissionType.ViewActivityLogQueue)
  findAll(@Query(new ZodValidationPipe(filterValidation)) query: z.infer<typeof filterValidation>) {
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
