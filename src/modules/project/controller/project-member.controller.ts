import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { ProjectMemberService } from "../service/project-member.service";
import { addProjectMemberValidation, updateProjectMemberValidation } from "../validation/project-member.validation";

@Controller("project/:projectId/members")
export class ProjectMemberController {
  constructor(private readonly projectMemberService: ProjectMemberService) {}

  @Post()
  @Permissions(PermissionType.AddProjectMember)
  addMember(
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(addProjectMemberValidation)) data: z.infer<typeof addProjectMemberValidation>,
  ) {
    return this.projectMemberService.addMember(projectId, data);
  }

  @Get()
  @Permissions(PermissionType.ViewProjectMember)
  getMembers(@Param("projectId") projectId: string) {
    return this.projectMemberService.getProjectMembers(projectId);
  }

  @Patch(":memberId")
  @Permissions(PermissionType.UpdateProjectMember)
  updateRole(
    @Param("projectId") projectId: string,
    @Param("memberId") memberId: string,
    @Body(new ZodValidationPipe(updateProjectMemberValidation)) data: z.infer<typeof updateProjectMemberValidation>,
  ) {
    return this.projectMemberService.updateMemberRole(projectId, memberId, data);
  }

  @Delete(":memberId")
  @Permissions(PermissionType.RemoveProjectMember)
  removeMember(@Param("projectId") projectId: string, @Param("memberId") memberId: string) {
    return this.projectMemberService.removeMember(projectId, memberId);
  }
}
