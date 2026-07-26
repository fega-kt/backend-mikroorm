import { BaseService } from "@common/base/base.service";
import { EntityData } from "@mikro-orm/core";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { PrincipalEntity } from "@core-service/entities/principal";
import { FlowableService } from "@modules/flowable/flowable.service";
import { BadRequestException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { CategoryEntity } from "../../entities/category";
import { ApproverType, WfApprovalData, WorkflowSettingEntity } from "../../entities/workflow-setting";
import {
  createWorkflowSettingValidation,
  updateWorkflowSettingValidation,
  workflowSettingFilterValidation,
} from "../../controllers/workflow-setting/workflow-setting.validation";

@Injectable({ scope: Scope.REQUEST })
export class WorkflowSettingService extends BaseService<WorkflowSettingEntity> {
  constructor(
    @InjectRepository(WorkflowSettingEntity)
    protected readonly repo: EntityRepository<WorkflowSettingEntity>,
    @InjectRepository(PrincipalEntity)
    private readonly principalRepo: EntityRepository<PrincipalEntity>,
    private readonly flowableService: FlowableService,
  ) {
    super();
  }

  private collectApproverIds(approvalConfig: WorkflowSettingEntity["approvalConfig"]): string[] {
    if (!approvalConfig) return [];
    const ids = new Set<string>();
    for (const data of Object.values(approvalConfig)) {
      for (const approver of data.approvers) {
        if (approver.type === ApproverType.User && approver.approvers?.length) {
          approver.approvers.forEach((uid) => ids.add(uid));
        }
      }
    }
    return [...ids];
  }

  private async validateApproverIds(approvalConfig: WorkflowSettingEntity["approvalConfig"]) {
    const ids = this.collectApproverIds(approvalConfig);
    if (!ids.length) return;
    const found = await this.principalRepo.find({ id: { $in: ids }, deleted: { $ne: true } }, { fields: ["id"] });
    if (found.length !== ids.length) {
      const foundIds = new Set(found.map((p) => p.id));
      const invalid = ids.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Invalid principal IDs: ${invalid.join(", ")}`);
    }
  }

  async createWorkflowSetting(data: z.infer<typeof createWorkflowSettingValidation>) {
    await this.validateApproverIds(data.approvalConfig ?? undefined);
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
      sort: { updatedAt: "DESC" },
    });
  }

  async getWorkflowSettingById(id: string) {
    const setting = await this.findOne(
      { id, deleted: { $ne: true } },
      {
        fields: ["id", "name", "status", "description", "approvalConfig", "createdAt", "category", "category.id", "category.name"],
        populate: ["category"],
      },
    );
    if (!setting) throw new NotFoundException("Workflow setting not found");

    const approvalConfig = setting.approvalConfig;
    if (!approvalConfig) return setting;

    const userIds = new Set(this.collectApproverIds(approvalConfig));
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

    // Enrich approver entries in-place (no flush → no DB write)
    const enriched: Record<string, WfApprovalData> = {};
    for (const [nodeId, data] of Object.entries(approvalConfig)) {
      enriched[nodeId] = {
        ...data,
        approvers: data.approvers.map((approver) => {
          if (approver.type !== ApproverType.User || !approver.approvers?.length) return approver;
          return {
            ...approver,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- enriched shape (Principal objects) intentionally diverges from the stored string[] shape for display
            approvers: approver.approvers.map((uid) => userMap.get(uid) ?? { id: uid }) as any,
          };
        }),
      };
    }
    setting.approvalConfig = enriched;
    return setting;
  }

  async updateWorkflowSetting(id: string, data: z.infer<typeof updateWorkflowSettingValidation>) {
    const setting = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!setting) throw new NotFoundException("Workflow setting not found");
    await this.validateApproverIds(data.approvalConfig ?? undefined);
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

  /**
   * Forwards an already-built BPMN 2.0 XML file to flowable-helper for deployment. BPMN authoring
   * itself happens outside this backend (matching v5's frontend-rfa role) — the caller supplies
   * processDefinitionKey because that's the process id they baked into the XML before uploading
   * (`<bpmn:process id="...">`); Flowable's deploy response doesn't expose it directly. No
   * deploymentId is stored — the latest process definition for this key is resolved on demand.
   */
  async deployWorkflowSetting(id: string, file: Express.Multer.File, processDefinitionKey: string) {
    const setting = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!setting) throw new NotFoundException("Workflow setting not found");
    if (!file) throw new BadRequestException("BPMN file is required");

    await this.flowableService.deploy(file.buffer, file.originalname);

    return this.updateOne(id, { processDefinitionKey });
  }

  /** The BPMN XML itself is never persisted in our DB (matches v5) — fetched from Flowable on
   *  demand by resolving processDefinitionKey to its latest process definition, so the admin
   *  always reopens the real, current diagram to keep editing. */
  async getWorkflowSettingBpmnXml(id: string): Promise<{ xml: string | null }> {
    const setting = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!setting) throw new NotFoundException("Workflow setting not found");
    if (!setting.processDefinitionKey) return { xml: null };

    const definition = await this.flowableService.getLatestProcessDefinitionByKey(setting.processDefinitionKey);
    if (!definition) return { xml: null };

    const xml = await this.flowableService.getProcessDefinitionResourceXml(definition.id);
    return { xml };
  }
}
