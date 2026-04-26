import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { MilestoneService } from "../service/milestone.service";
import {
  createMilestoneValidation,
  milestoneFilterValidation,
  updateMilestoneValidation,
} from "../validation/milestone.validation";

@Controller("milestone")
export class MilestoneController {
  constructor(private readonly milestoneService: MilestoneService) {}

  @Post()
  @Permissions(PermissionType.CreateMilestone)
  create(@Body(new ZodValidationPipe(createMilestoneValidation)) data: z.infer<typeof createMilestoneValidation>) {
    return this.milestoneService.createMilestone(data);
  }

  @Get("by-project/:projectId")
  @Permissions(PermissionType.MenuMilestone)
  findByProject(
    @Param("projectId") projectId: string,
    @Query(new ZodValidationPipe(milestoneFilterValidation)) query: z.infer<typeof milestoneFilterValidation>,
  ) {
    return this.milestoneService.getMilestonesByProject(projectId, query);
  }

  @Get("by-project/:projectId/overdue")
  @Permissions(PermissionType.MenuMilestone)
  getOverdue(@Param("projectId") projectId: string) {
    return this.milestoneService.getOverdueMilestones(projectId);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewMilestoneDetail)
  findOne(@Param("id") id: string) {
    return this.milestoneService.getMilestoneById(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateMilestone)
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateMilestoneValidation)) data: z.infer<typeof updateMilestoneValidation>) {
    return this.milestoneService.updateMilestone(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteMilestone)
  remove(@Param("id") id: string) {
    return this.milestoneService.deleteMilestone(id);
  }
}
