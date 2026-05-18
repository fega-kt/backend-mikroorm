import { IUserResponse } from "@common/base/consts";
import { EntityManager } from "@mikro-orm/mongodb";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ProjectMemberEntity, ProjectMemberRole } from "../entity/project-member.entity";
import { ProjectEntity } from "../entity/project.entity";

@Injectable()
export class ProjectPermissionService {
  constructor(private readonly em: EntityManager) {}

  private async loadProject(projectId: string): Promise<ProjectEntity> {
    const project = await this.em.findOne(ProjectEntity, { id: projectId, deleted: { $ne: true } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  isOwner(project: ProjectEntity, userId: string): boolean {
    return (project.owner as any)?.id === userId || project.owner?.toString() === userId;
  }

  async getMembership(projectId: string, userId: string): Promise<ProjectMemberEntity | null> {
    return this.em.findOne(ProjectMemberEntity, {
      project: projectId,
      user: userId,
      deleted: { $ne: true },
    });
  }

  async assertMember(projectId: string, user: IUserResponse): Promise<void> {
    const project = await this.loadProject(projectId);
    if (this.isOwner(project, user.id)) return;

    const membership = await this.getMembership(projectId, user.id);
    if (!membership) throw new ForbiddenException("You are not a member of this project");
  }

  async assertOwner(projectId: string, user: IUserResponse): Promise<void> {
    const project = await this.loadProject(projectId);
    if (!this.isOwner(project, user.id)) {
      throw new ForbiddenException("Only the project owner can perform this action");
    }
  }

  /** Owner hoặc PM có thể quản lý dự án */
  async assertManagerRole(projectId: string, user: IUserResponse): Promise<void> {
    const project = await this.loadProject(projectId);
    if (this.isOwner(project, user.id)) return;

    const membership = await this.getMembership(projectId, user.id);
    if (membership?.role !== ProjectMemberRole.PM) {
      throw new ForbiddenException("Only the project owner or PM can perform this action");
    }
  }

  async assertMemberOrAssignee(projectId: string, assigneeId: string, user: IUserResponse): Promise<void> {
    if (assigneeId === user.id) return;
    await this.assertMember(projectId, user);
  }

  /** Lấy danh sách project IDs mà user là member */
  async getMemberProjectIds(userId: string): Promise<string[]> {
    const memberships = await this.em.find(ProjectMemberEntity, {
      user: userId,
      deleted: { $ne: true },
    });
    return memberships.map((m) => (m.project as any)?.id ?? m.project.toString());
  }
}
