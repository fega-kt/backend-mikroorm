import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { z } from "zod";
import { SectionEntity } from "../entity/section.entity";
import { createSectionValidation, updateSectionValidation } from "../validation/section.validation";
import { ProjectPermissionService } from "./project-permission.service";

@Injectable({ scope: Scope.REQUEST })
export class SectionService extends BaseService<SectionEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(SectionEntity)
    private readonly sectionRepo: EntityRepository<SectionEntity>,
    private readonly projectPermissionService: ProjectPermissionService,
  ) {
    super(sectionRepo, request);
  }

  async createSection(projectId: string, data: z.infer<typeof createSectionValidation>) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertMember(projectId, user);
    return this.addOne({ ...data, project: projectId });
  }

  async getSectionsByProject(projectId: string) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertMember(projectId, user);
    return this.findAll({ project: projectId, deleted: { $ne: true } }, { fields: ["id", "name", "order", "project"], populate: [] });
  }

  async reorder(projectId: string, orders: { id: string; order: number }[]) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertMember(projectId, user);

    const em = this.sectionRepo.getEntityManager();
    for (const { id, order } of orders) {
      const section = await this.sectionRepo.findOne({ id });
      if (!section) throw new NotFoundException(`Section ${id} not found`);
      section.order = order;
    }
    await em.flush();
    return { message: "Reordered successfully" };
  }

  async updateSection(id: string, data: z.infer<typeof updateSectionValidation>) {
    const user = this.getCurrentUser();
    const section = await this.sectionRepo.findOne({ id, deleted: { $ne: true } });
    if (!section) throw new NotFoundException("Section not found");
    const projectId = section.project.id;
    await this.projectPermissionService.assertMember(projectId, user);
    return this.updateOne(id, data);
  }

  async deleteSection(id: string) {
    const user = this.getCurrentUser();
    const section = await this.sectionRepo.findOne({ id, deleted: { $ne: true } });
    if (!section) throw new NotFoundException("Section not found");
    const projectId = section.project.id;
    await this.projectPermissionService.assertMember(projectId, user);
    return this.remove(id);
  }
}
