import { BaseService } from "@common/base/base.service";
import { PrincipalEntity } from "@core-service/entities/principal";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { WorkflowTaskEntity } from "../../entities/workflow-task";
import { workflowTaskFilterValidation } from "../../controllers/workflow-task/workflow-task.validation";

@Injectable({ scope: Scope.REQUEST })
export class WorkflowTaskService extends BaseService<WorkflowTaskEntity> {
  constructor(
    @InjectRepository(WorkflowTaskEntity)
    protected readonly repo: EntityRepository<WorkflowTaskEntity>,
    @InjectRepository(PrincipalEntity)
    private readonly principalRepo: EntityRepository<PrincipalEntity>,
  ) {
    super();
  }

  async getMyTasks(filter: z.infer<typeof workflowTaskFilterValidation>) {
    const { page, limit, status } = filter;
    const currentUser = this.getCurrentUser();
    const principal = await this.principalRepo.findOne({ user: currentUser.id });
    if (!principal) return { data: [], total: 0, page, limit };

    const where: FilterQuery<WorkflowTaskEntity> = { approver: principal.id, deleted: { $ne: true } };
    if (status) where.status = status;

    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "stepName", "status", "comment", "completedAt", "createdAt", "workflowInstance", "workflowInstance.title"],
      populate: ["workflowInstance"],
      sort: { createdAt: "DESC" },
    });
  }

  async getWorkflowTaskById(id: string) {
    const task = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["workflowInstance", "approver"] });
    if (!task) throw new NotFoundException("Workflow task not found");
    return task;
  }
}
