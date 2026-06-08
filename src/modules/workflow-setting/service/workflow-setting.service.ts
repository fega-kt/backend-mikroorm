import { BaseService } from "@common/base/base.service";
import { EntityData } from "@mikro-orm/core";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { PrincipalEntity } from "@modules/principal/entity/principal.entity";
import { BadRequestException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { ApproverType, WfApprovalData, WfNodeType, WorkflowSettingEntity } from "../entity/workflow-setting.entity";
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
    @InjectRepository(PrincipalEntity)
    private readonly principalRepo: EntityRepository<PrincipalEntity>,
  ) {
    super();
  }

  private collectApproverIds(wf: WorkflowSettingEntity["workflowDefinition"]): string[] {
    if (!wf) return [];
    const ids = new Set<string>();
    for (const node of wf.nodes) {
      if (node.type === WfNodeType.Approval) {
        const data = node.data as WfApprovalData;
        for (const approver of data.approvers) {
          if (approver.type === ApproverType.User && approver.approvers?.length) {
            approver.approvers.forEach((uid) => ids.add(uid));
          }
        }
      }
    }
    return [...ids];
  }

  private async validateApproverIds(wf: WorkflowSettingEntity["workflowDefinition"]) {
    const ids = this.collectApproverIds(wf);
    if (!ids.length) return;
    const found = await this.principalRepo.find({ id: { $in: ids }, deleted: { $ne: true } }, { fields: ["id"] });
    if (found.length !== ids.length) {
      const foundIds = new Set(found.map((p) => p.id));
      const invalid = ids.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Invalid principal IDs: ${invalid.join(", ")}`);
    }
  }

  async createWorkflowSetting(data: z.infer<typeof createWorkflowSettingValidation>) {
    await this.validateApproverIds(data.workflowDefinition ?? undefined);
    const em = this.repo.getEntityManager();
    const category = em.getReference(CategoryEntity, data.category);
    return this.addOne({
      ...data,
      category,
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
        fields: ["id", "name", "status", "description", "workflowDefinition", "createdAt", "category", "category.id", "category.name"],
        populate: ["category"],
      },
    );
    if (!setting) throw new NotFoundException("Workflow setting not found");

    const wf = setting.workflowDefinition;
    if (!wf) return setting;

    // Collect unique user IDs from all approval nodes
    const userIds = new Set<string>();
    for (const node of wf.nodes) {
      if (node.type === WfNodeType.Approval) {
        const data = node.data as WfApprovalData;
        for (const approver of data.approvers) {
          if (approver.type === ApproverType.User && approver.approvers?.length) {
            approver.approvers.forEach((uid) => userIds.add(uid));
          }
        }
      }
    }

    if (!userIds.size) return setting;

    // Single batch query for all referenced principals
    const principals = await this.principalRepo.find(
      { id: { $in: [...userIds] } },
      {
        populate: ["user", "group"],
        fields: ["id", "name", "type", "description", "user", "group", "user.id", "user.fullName", "user.avatar", "group.id", "group.name"],
      },
    );
    const userMap = new Map(principals.map((p) => [p.id, p]));

    // Enrich approval nodes in-place (no flush → no DB write)
    const enrichedNodes = wf.nodes.map((node) => {
      if (node.type !== WfNodeType.Approval) return node;
      const data = node.data as WfApprovalData;
      return {
        ...node,
        data: {
          ...data,
          approvers: data.approvers.map((approver) => {
            if (approver.type !== ApproverType.User || !approver.approvers?.length) return approver;
            return {
              ...approver,
              approvers: approver.approvers.map((uid) => userMap.get(uid) ?? { id: uid }),
            };
          }),
        },
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (setting as any).workflowDefinition = { nodes: enrichedNodes, edges: wf.edges };
    return setting;
  }

  async updateWorkflowSetting(id: string, data: z.infer<typeof updateWorkflowSettingValidation>) {
    const setting = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!setting) throw new NotFoundException("Workflow setting not found");
    await this.validateApproverIds(data.workflowDefinition ?? undefined);
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
