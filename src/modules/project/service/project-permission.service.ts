import { IUserResponse } from "@common/base/consts";
import { EntityManager } from "@mikro-orm/mongodb";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ProjectEntity } from "../entity/project.entity";

@Injectable()
export class ProjectPermissionService {
  constructor(private readonly em: EntityManager) {}

  private async loadProject(projectId: string): Promise<ProjectEntity> {
    const project = await this.em.findOne(
      ProjectEntity,
      { id: projectId, deleted: { $ne: true } },
      { populate: ["members"] },
    );
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  // ─── Atomic helpers (sync, nhận project đã load) ───────────────────────────

  isOwner(project: ProjectEntity, userId: string): boolean {
    return (project.owner as any)?.id === userId || project.owner?.toString() === userId;
  }

  isMember(project: ProjectEntity, userId: string): boolean {
    return project.members.getItems().some((m: any) => m.id === userId || m.toString() === userId);
  }

  // ─── Composed assertions (async, tự load project) ──────────────────────────

  /** owner hoặc member */
  async assertMember(projectId: string, user: IUserResponse): Promise<void> {
    const project = await this.loadProject(projectId);
    if (!this.isOwner(project, user.id) && !this.isMember(project, user.id)) {
      throw new ForbiddenException("You are not a member of this project");
    }
  }

  /** chỉ owner */
  async assertOwner(projectId: string, user: IUserResponse): Promise<void> {
    const project = await this.loadProject(projectId);
    if (!this.isOwner(project, user.id)) {
      throw new ForbiddenException("Only the project owner can perform this action");
    }
  }

  /** assignee của task hoặc owner/member của project */
  async assertMemberOrAssignee(projectId: string, assigneeId: string, user: IUserResponse): Promise<void> {
    if (assigneeId === user.id) return;
    await this.assertMember(projectId, user);
  }
}
