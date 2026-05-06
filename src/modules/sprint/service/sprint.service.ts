import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ProjectPermissionService } from "@modules/project/service/project-permission.service";
import { BadRequestException, Inject, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { z } from "zod";
import { SprintEntity, SprintStatus } from "../entity/sprint.entity";
import { createSprintValidation, sprintFilterValidation, updateSprintValidation } from "../validation/sprint.validation";

@Injectable({ scope: Scope.REQUEST })
export class SprintService extends BaseService<SprintEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(SprintEntity)
    private readonly sprintRepo: EntityRepository<SprintEntity>,
    private readonly projectPermissionService: ProjectPermissionService,
  ) {
    super(sprintRepo, request);
  }

  async createSprint(data: z.infer<typeof createSprintValidation>) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertManagerRole(data.project, user);

    if (data.startDate >= data.endDate) {
      throw new BadRequestException("startDate must be before endDate");
    }

    return this.addOne(data as any);
  }

  async getSprintsByProject(projectId: string, filter: z.infer<typeof sprintFilterValidation>) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertMember(projectId, user);

    const { page, limit, status } = filter;
    const where: Record<string, any> = { project: projectId, deleted: { $ne: true } };
    if (status) where.status = status;

    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "name", "goal", "startDate", "endDate", "status", "createdAt"],
    });
  }

  async getSprintById(id: string) {
    const sprint = await this.sprintRepo.findOne({ id, deleted: { $ne: true } }, { populate: ["project"] });
    if (!sprint) throw new NotFoundException("Sprint not found");

    const user = this.getCurrentUser();
    const projectId = (sprint.project as any)?.id ?? sprint.project.toString();
    await this.projectPermissionService.assertMember(projectId, user);

    return sprint;
  }

  async updateSprint(id: string, data: z.infer<typeof updateSprintValidation>) {
    const sprint = await this.sprintRepo.findOne({ id, deleted: { $ne: true } }, { populate: ["project"] });
    if (!sprint) throw new NotFoundException("Sprint not found");

    const user = this.getCurrentUser();
    const projectId = (sprint.project as any)?.id ?? sprint.project.toString();
    await this.projectPermissionService.assertManagerRole(projectId, user);

    const startDate = data.startDate ?? sprint.startDate;
    const endDate = data.endDate ?? sprint.endDate;
    if (startDate >= endDate) throw new BadRequestException("startDate must be before endDate");

    return this.updateOne(id, data as any);
  }

  async deleteSprint(id: string) {
    const sprint = await this.sprintRepo.findOne({ id, deleted: { $ne: true } }, { populate: ["project"] });
    if (!sprint) throw new NotFoundException("Sprint not found");

    const user = this.getCurrentUser();
    const projectId = (sprint.project as any)?.id ?? sprint.project.toString();
    await this.projectPermissionService.assertManagerRole(projectId, user);

    if (sprint.status === SprintStatus.ACTIVE) {
      throw new BadRequestException("Cannot delete an active sprint");
    }

    return this.remove(id);
  }
}
