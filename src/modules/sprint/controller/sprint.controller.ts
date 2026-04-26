import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { SprintService } from "../service/sprint.service";
import { createSprintValidation, sprintFilterValidation, updateSprintValidation } from "../validation/sprint.validation";

@Controller("sprint")
export class SprintController {
  constructor(private readonly sprintService: SprintService) {}

  @Post()
  @Permissions(PermissionType.CreateSprint)
  create(@Body(new ZodValidationPipe(createSprintValidation)) data: z.infer<typeof createSprintValidation>) {
    return this.sprintService.createSprint(data);
  }

  @Get("by-project/:projectId")
  @Permissions(PermissionType.MenuSprint)
  findByProject(
    @Param("projectId") projectId: string,
    @Query(new ZodValidationPipe(sprintFilterValidation)) query: z.infer<typeof sprintFilterValidation>,
  ) {
    return this.sprintService.getSprintsByProject(projectId, query);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewSprintDetail)
  findOne(@Param("id") id: string) {
    return this.sprintService.getSprintById(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateSprint)
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateSprintValidation)) data: z.infer<typeof updateSprintValidation>) {
    return this.sprintService.updateSprint(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteSprint)
  remove(@Param("id") id: string) {
    return this.sprintService.deleteSprint(id);
  }
}
