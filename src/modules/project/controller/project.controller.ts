import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import z from "zod";
import { ProjectService } from "../service/project.service";
import { createProjectValidation, updateProjectValidation } from "../validation/project.validation";

@Controller("project")
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @Permissions(PermissionType.CreateProject)
  create(
    @Body(new ZodValidationPipe(createProjectValidation))
    data: z.infer<typeof createProjectValidation>,
  ) {
    return this.projectService.createProject(data);
  }

  @Get()
  @Permissions(PermissionType.MenuProject)
  findAll(@Query("page") page = 1, @Query("limit") limit = 10) {
    return this.projectService.getProjects(Number(page), Number(limit));
  }

  @Get(":id")
  @Permissions(PermissionType.ViewProjectDetail)
  findOne(@Param("id") id: string) {
    return this.projectService.getProjectById(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateProject)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectValidation))
    data: z.infer<typeof updateProjectValidation>,
  ) {
    return this.projectService.updateProject(id, data);
  }

  @Get(":id/stats")
  @Permissions(PermissionType.ViewProjectDetail)
  getStats(@Param("id") id: string) {
    return this.projectService.getProjectStats(id);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteProject)
  remove(@Param("id") id: string) {
    return this.projectService.deleteProject(id);
  }
}
