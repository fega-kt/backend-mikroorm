import { BaseService } from "@common/base/base.service";
import { UserEntity } from "@core-service/entities/user";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { RequestTypeEntity } from "../../entities/request-type";
import { WorkflowInstanceEntity, WorkflowInstanceStatus } from "../../entities/workflow-instance";
import { WorkflowSettingEntity } from "../../entities/workflow-setting";
import {
  createWorkflowInstanceValidation,
  workflowInstanceFilterValidation,
} from "../../controllers/workflow-instance/workflow-instance.validation";

@Injectable({ scope: Scope.REQUEST })
export class WorkflowInstanceService extends BaseService<WorkflowInstanceEntity> {
  constructor(
    @InjectRepository(WorkflowInstanceEntity)
    protected readonly repo: EntityRepository<WorkflowInstanceEntity>,
    @InjectRepository(RequestTypeEntity)
    private readonly requestTypeRepo: EntityRepository<RequestTypeEntity>,
  ) {
    super();
  }

  /** Mirrors v5's RequestEntity.code/counter/counterCode — e.g. "TEST-2026-0007", scoped per
   *  requestType per calendar year. No code is generated when requestType is omitted. */
  private async generateCode(requestType: RequestTypeEntity): Promise<{ code: string; counter: number; counterCode: string }> {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const existingCount = await this.repo.count({
      requestType: requestType.id,
      createdAt: { $gte: yearStart, $lt: yearEnd },
    });
    const counter = existingCount + 1;
    const counterCode = String(counter).padStart(4, "0");
    return { code: `${requestType.prefix}-${year}-${counterCode}`, counter, counterCode };
  }

  async createWorkflowInstance(data: z.infer<typeof createWorkflowInstanceValidation>) {
    const em = this.repo.getEntityManager();
    const currentUser = this.getCurrentUser();

    let requestType: RequestTypeEntity | undefined;
    let codeFields: { code: string; counter: number; counterCode: string } | undefined;
    if (data.requestType) {
      requestType = (await this.requestTypeRepo.findOne({ id: data.requestType, deleted: { $ne: true } })) ?? undefined;
      if (!requestType) throw new NotFoundException("Request type not found");
      codeFields = await this.generateCode(requestType);
    }

    return this.addOne({
      title: data.title,
      content: data.content ?? undefined,
      requester: em.getReference(UserEntity, currentUser.id),
      requestType,
      workflowSetting: em.getReference(WorkflowSettingEntity, data.workflowSetting),
      status: WorkflowInstanceStatus.Draft,
      ...codeFields,
    });
  }

  async getWorkflowInstances(filter: z.infer<typeof workflowInstanceFilterValidation>) {
    const { page, limit, status, search } = filter;
    const where: FilterQuery<WorkflowInstanceEntity> = { deleted: { $ne: true } };
    if (status) where.status = status;
    if (search) where.title = { $re: search, $options: "i" } as never;
    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "title", "status", "currentStepName", "processInstanceId", "createdAt", "requester", "requester.fullName"],
      populate: ["requester"],
      sort: { updatedAt: "DESC" },
    });
  }

  async getWorkflowInstanceById(id: string) {
    const instance = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["requester", "requestType", "workflowSetting"] });
    if (!instance) throw new NotFoundException("Workflow instance not found");
    return instance;
  }
}
