import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ProjectPermissionService } from "@modules/project/service/project-permission.service";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { MilestoneEntity, MilestoneStatus } from "../entity/milestone.entity";
import { createMilestoneValidation, milestoneFilterValidation, updateMilestoneValidation } from "../validation/milestone.validation";

@Injectable({ scope: Scope.REQUEST })
export class MilestoneService extends BaseService<MilestoneEntity> {
  constructor(
    @InjectRepository(MilestoneEntity)
    protected readonly repo: EntityRepository<MilestoneEntity>,
    private readonly projectPermissionService: ProjectPermissionService,
  ) {
    super();
  }

  async createMilestone(data: z.infer<typeof createMilestoneValidation>) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertManagerRole(data.project, user);
    return this.addOne(data);
  }

  async getMilestonesByProject(projectId: string, filter: z.infer<typeof milestoneFilterValidation>) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertMember(projectId, user);

    const { page, limit, status } = filter;
    const where: Record<string, any> = { project: projectId, deleted: { $ne: true } };
    if (status) where.status = status;

    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "name", "description", "dueDate", "status", "completedAt", "createdAt"],
    });
  }

  async getMilestoneById(id: string) {
    const milestone = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["project"] });
    if (!milestone) throw new NotFoundException("Milestone not found");

    const user = this.getCurrentUser();
    const projectId = (milestone.project as any)?.id ?? milestone.project.toString();
    await this.projectPermissionService.assertMember(projectId, user);

    return milestone;
  }

  async updateMilestone(id: string, data: z.infer<typeof updateMilestoneValidation>) {
    const milestone = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["project"] });
    if (!milestone) throw new NotFoundException("Milestone not found");

    const user = this.getCurrentUser();
    const projectId = (milestone.project as any)?.id ?? milestone.project.toString();
    await this.projectPermissionService.assertManagerRole(projectId, user);

    const update: Record<string, any> = { ...data };
    if (data.status === MilestoneStatus.COMPLETED && !data.completedAt) {
      update.completedAt = new Date();
    }

    return this.updateOne(id, update as any);
  }

  async deleteMilestone(id: string) {
    const milestone = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["project"] });
    if (!milestone) throw new NotFoundException("Milestone not found");

    const user = this.getCurrentUser();
    const projectId = (milestone.project as any)?.id ?? milestone.project.toString();
    await this.projectPermissionService.assertManagerRole(projectId, user);

    return this.remove(id);
  }

  /** Lấy danh sách milestone sắp đến hạn hoặc đã missed */
  async getOverdueMilestones(projectId: string) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertMember(projectId, user);

    return this.findAll(
      {
        project: projectId,
        deleted: { $ne: true },
        dueDate: { $lt: new Date() },
        status: { $nin: [MilestoneStatus.COMPLETED] },
      },
      { fields: ["id", "name", "dueDate", "status"] },
    );
  }
}
