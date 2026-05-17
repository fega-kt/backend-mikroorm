import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { ProjectMemberEntity } from "../entity/project-member.entity";
import { addProjectMemberValidation, updateProjectMemberValidation } from "../validation/project-member.validation";
import { ProjectPermissionService } from "./project-permission.service";

@Injectable({ scope: Scope.REQUEST })
export class ProjectMemberService extends BaseService<ProjectMemberEntity> {
  constructor(
    @InjectRepository(ProjectMemberEntity)
    protected readonly repo: EntityRepository<ProjectMemberEntity>,
    private readonly projectPermissionService: ProjectPermissionService,
  ) {
    super();
  }

  async addMember(projectId: string, data: z.infer<typeof addProjectMemberValidation>) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertManagerRole(projectId, user);

    const existing = await this.repo.findOne({
      project: projectId,
      user: data.userId,
      deleted: { $ne: true },
    });
    if (existing) throw new ConflictException("User is already a member of this project");

    return this.addOne({ project: projectId, user: data.userId, role: data.role } as any);
  }

  async updateMemberRole(projectId: string, memberId: string, data: z.infer<typeof updateProjectMemberValidation>) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertManagerRole(projectId, user);

    const member = await this.repo.findOne({ id: memberId, project: projectId, deleted: { $ne: true } });
    if (!member) throw new NotFoundException("Member not found");

    return this.updateOne(memberId, { role: data.role } as any);
  }

  async removeMember(projectId: string, memberId: string) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertManagerRole(projectId, user);

    const member = await this.repo.findOne({ id: memberId, project: projectId, deleted: { $ne: true } });
    if (!member) throw new NotFoundException("Member not found");

    return this.remove(memberId);
  }

  getProjectMembers(projectId: string) {
    return this.findAll(
      { project: projectId, deleted: { $ne: true } },
      {
        fields: ["id", "role", "joinedAt", "user.id", "user.fullName", "user.avatar", "user.workEmail", "user.loginName"],
        populate: ["user"],
      },
    );
  }
}
