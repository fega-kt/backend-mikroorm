import { BaseService } from "@common/base/base.service";
import { PrincipalEntity } from "@core-service/entities/principal";
import { EntityData, EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { RequestTypeEntity } from "../../entities/request-type";
import { WorkflowDelegationSettingEntity } from "../../entities/workflow-delegation-setting";
import { WorkflowSettingEntity } from "../../entities/workflow-setting";
import {
  createWorkflowDelegationSettingValidation,
  updateWorkflowDelegationSettingValidation,
  workflowDelegationSettingFilterValidation,
} from "../../controllers/workflow-delegation-setting/workflow-delegation-setting.validation";

@Injectable({ scope: Scope.REQUEST })
export class WorkflowDelegationSettingService extends BaseService<WorkflowDelegationSettingEntity> {
  constructor(
    @InjectRepository(WorkflowDelegationSettingEntity)
    protected readonly repo: EntityRepository<WorkflowDelegationSettingEntity>,
  ) {
    super();
  }

  async createWorkflowDelegationSetting(data: z.infer<typeof createWorkflowDelegationSettingValidation>) {
    const em = this.repo.getEntityManager();
    const entity = await this.addOne({
      originalApprover: em.getReference(PrincipalEntity, data.originalApprover),
      fromDate: data.fromDate,
      toDate: data.toDate,
      description: data.description ?? undefined,
    });

    entity.delegatedApprovers.set(data.delegatedApprovers.map((id) => em.getReference(PrincipalEntity, id)));
    if (data.requestTypes?.length) entity.requestTypes.set(data.requestTypes.map((id) => em.getReference(RequestTypeEntity, id)));
    if (data.workflowSettings?.length)
      entity.workflowSettings.set(data.workflowSettings.map((id) => em.getReference(WorkflowSettingEntity, id)));
    await em.flush();
    return entity;
  }

  async getWorkflowDelegationSettings(filter: z.infer<typeof workflowDelegationSettingFilterValidation>) {
    const { page, limit, originalApprover } = filter;
    const where: FilterQuery<WorkflowDelegationSettingEntity> = { deleted: { $ne: true } };
    if (originalApprover) where.originalApprover = originalApprover;
    return this.paginate(where, {
      page,
      limit,
      populate: ["originalApprover", "delegatedApprovers"],
      sort: { updatedAt: "DESC" },
    });
  }

  async getWorkflowDelegationSettingById(id: string) {
    const setting = await this.repo.findOne(
      { id, deleted: { $ne: true } },
      { populate: ["originalApprover", "delegatedApprovers", "requestTypes", "workflowSettings"] },
    );
    if (!setting) throw new NotFoundException("Workflow delegation setting not found");
    return setting;
  }

  async updateWorkflowDelegationSetting(id: string, data: z.infer<typeof updateWorkflowDelegationSettingValidation>) {
    const setting = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!setting) throw new NotFoundException("Workflow delegation setting not found");
    const em = this.repo.getEntityManager();

    const { originalApprover, delegatedApprovers, requestTypes, workflowSettings, ...rest } = data;
    const update: EntityData<WorkflowDelegationSettingEntity> = { ...rest };
    if (originalApprover) update.originalApprover = em.getReference(PrincipalEntity, originalApprover);
    await this.updateOne(id, update);

    if (delegatedApprovers) setting.delegatedApprovers.set(delegatedApprovers.map((pid) => em.getReference(PrincipalEntity, pid)));
    if (requestTypes) setting.requestTypes.set(requestTypes.map((rid) => em.getReference(RequestTypeEntity, rid)));
    if (workflowSettings) setting.workflowSettings.set(workflowSettings.map((wid) => em.getReference(WorkflowSettingEntity, wid)));
    await em.flush();
    return setting;
  }

  async deleteWorkflowDelegationSetting(id: string) {
    const setting = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!setting) throw new NotFoundException("Workflow delegation setting not found");
    return this.remove(id);
  }

  /** Active delegations covering `now` for this original approver, optionally scoped by request type
   *  and workflow setting (empty scope arrays on the setting mean "applies to all"). */
  async findActiveDelegations(originalApproverId: string, requestTypeId?: string, workflowSettingId?: string) {
    const now = new Date();
    const candidates = await this.repo.find(
      { originalApprover: originalApproverId, deleted: { $ne: true }, fromDate: { $lte: now }, toDate: { $gte: now } },
      { populate: ["delegatedApprovers", "requestTypes", "workflowSettings"] },
    );
    return candidates.filter((c) => {
      const requestTypeMatches =
        !c.requestTypes.length || (requestTypeId && c.requestTypes.getItems().some((rt) => rt.id === requestTypeId));
      const workflowSettingMatches = !c.workflowSettings.length || c.workflowSettings.getItems().some((ws) => ws.id === workflowSettingId);
      return requestTypeMatches && workflowSettingMatches;
    });
  }
}
