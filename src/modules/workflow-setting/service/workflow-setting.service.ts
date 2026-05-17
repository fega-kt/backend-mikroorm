import { BaseService } from "@common/base/base.service";
import { EntityData } from "@mikro-orm/core";
import { EntityRepository, FilterQuery } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { WorkflowSettingEntity } from "../entity/workflow-setting.entity";
import {
  createWorkflowSettingValidation,
  updateWorkflowSettingValidation,
  workflowSettingFilterValidation,
} from "../validation/workflow-setting.validation";

@Injectable({ scope: Scope.REQUEST })
export class WorkflowSettingService extends BaseService<WorkflowSettingEntity> {
  constructor(
    @InjectRepository(WorkflowSettingEntity)
    protected readonly repo: EntityRepository<WorkflowSettingEntity>,
  ) {
    super();
  }

  async createWorkflowSetting(data: z.infer<typeof createWorkflowSettingValidation>) {
    const em = this.repo.getEntityManager();
    const category = em.getReference(CategoryEntity, data.category);
    return this.addOne({
      name: data.name,
      category,
      status: data.status,
      ...(data.description != null && { description: data.description }),
      ...(data.bpmnXml != null && { bpmnXml: data.bpmnXml }),
    });
  }

  async getWorkflowSettings(filter: z.infer<typeof workflowSettingFilterValidation>) {
    const { page, limit, category, status, search } = filter;
    const where: FilterQuery<WorkflowSettingEntity> = { deleted: { $ne: true } };
    if (category) where.category = category;
    if (status) where.status = status;
    if (search) where.name = { $re: search, $options: "i" } as never;
    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "name", "status", "description", "createdAt", "category", "category.id", "category.name"],
      populate: ["category"],
    });
  }

  async getWorkflowSettingById(id: string) {
    const setting = await this.findOne(
      { id, deleted: { $ne: true } },
      {
        fields: ["id", "name", "status", "description", "bpmnXml", "createdAt", "category", "category.id", "category.name"],
        populate: ["category"],
      },
    );
    if (!setting) throw new NotFoundException("Workflow setting not found");
    return setting;
  }

  async updateWorkflowSetting(id: string, data: z.infer<typeof updateWorkflowSettingValidation>) {
    const setting = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!setting) throw new NotFoundException("Workflow setting not found");
    const { category, ...rest } = data;
    const update: EntityData<WorkflowSettingEntity> = { ...rest };
    if (category) {
      update.category = this.repo.getEntityManager().getReference(CategoryEntity, category);
    }
    return this.updateOne(id, update);
  }

  async deleteWorkflowSetting(id: string) {
    const setting = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!setting) throw new NotFoundException("Workflow setting not found");
    return this.remove(id);
  }
}
