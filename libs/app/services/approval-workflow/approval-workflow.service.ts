import { BaseService } from "@common/base/base.service";
import { DepartmentEntity } from "@core-service/entities/department";
import { UserEntity } from "@core-service/entities/user";
import { EntityRepository, FilterQuery, LockMode, serialize } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import type {
  ApprovalWorkflowFilterDto,
  CreateApprovalWorkflowDto,
  SimulateDto,
  UpdateApprovalWorkflowDto,
} from "../../controllers/approval-workflow/approval-workflow.validation";
import { ApprovalWorkflowEntity } from "../../entities/approval-workflow";
import { ApprovalWorkflowVersionEntity, ApprovalWorkflowVersionStatus } from "../../entities/approval-workflow-version";
import { RequestTypeEntity } from "../../entities/request-type";
import { ApprovalEngineService } from "../approval-engine/approval-engine.service";
import { ApproverResolver } from "../approval-engine/approver-resolver";
import {
  ApproverType,
  NodeType,
  workflowDefinitionSchema,
  type Approver,
  type WorkflowDefinition,
} from "../approval-engine/definition.schema";
import { GraphErrorCode, validateGraph, type GraphError } from "../approval-engine/validate-graph";

/** Quy trình mới: chỉ Bắt đầu → Kết thúc, admin tự thêm bước trên màn thiết kế */
const defaultDefinition = (): WorkflowDefinition =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: NodeType.Start, name: "Gửi tờ trình" },
      { id: "end", type: NodeType.End, name: "Đã duyệt" },
    ],
    edges: [{ id: "e_start_end", from: "start", to: "end" }],
    layout: { start: { x: 0, y: 0 }, end: { x: 0, y: 160 } },
  });

const VERSION_FIELDS = [
  "id",
  "version",
  "status",
  "publishedAt",
  "createdAt",
  "updatedAt",
  "publishedBy.id",
  "publishedBy.fullName",
] as const;

@Injectable({ scope: Scope.REQUEST })
export class ApprovalWorkflowService extends BaseService<ApprovalWorkflowEntity> {
  constructor(
    @InjectRepository(ApprovalWorkflowEntity)
    protected readonly repo: EntityRepository<ApprovalWorkflowEntity>,
    private readonly engine: ApprovalEngineService,
  ) {
    super();
  }

  private get em() {
    return this.repo.getEntityManager();
  }

  async getWorkflows(filter: ApprovalWorkflowFilterDto) {
    const { page, limit, requestTypeId, departmentId, isActive, search } = filter;
    const where: FilterQuery<ApprovalWorkflowEntity> = { deleted: { $ne: true } };
    if (requestTypeId) where.requestType = requestTypeId;
    if (departmentId) where.department = departmentId;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) where.name = { $ilike: `%${search}%` };

    const result = await this.paginate(where, {
      page,
      limit,
      fields: [
        "id",
        "name",
        "description",
        "priority",
        "isActive",
        "createdAt",
        "updatedAt",
        "requestType.id",
        "requestType.code",
        "requestType.name",
        "department.id",
        "department.name",
        "publishedVersion.id",
        "publishedVersion.version",
        "publishedVersion.publishedAt",
      ],
      populate: ["requestType", "department", "publishedVersion"],
      sort: { updatedAt: "DESC" },
    });

    const ids = result.data.map((w) => w.id);
    const drafts = ids.length
      ? await this.em.find(
          ApprovalWorkflowVersionEntity,
          { workflow: { $in: ids }, status: ApprovalWorkflowVersionStatus.Draft, deleted: { $ne: true } },
          { fields: ["id", "workflow", "version", "updatedAt"] },
        )
      : [];
    const draftByWorkflow = new Map(drafts.map((d) => [d.workflow.id, { id: d.id, version: d.version, updatedAt: d.updatedAt }]));
    return {
      ...result,
      data: result.data.map((w) => ({
        ...serialize(w, { populate: ["requestType", "department", "publishedVersion"], forceObject: true }),
        draftVersion: draftByWorkflow.get(w.id) ?? null,
      })),
    };
  }

  async createWorkflow(data: CreateApprovalWorkflowDto) {
    await this.ensureRequestType(data.requestType);
    return this.em.transactional(async (em) => {
      const audit = this.getDefaultValuesForCreate();
      const workflow = em.create(ApprovalWorkflowEntity, {
        name: data.name,
        description: data.description ?? undefined,
        requestType: em.getReference(RequestTypeEntity, data.requestType),
        department: data.department ? em.getReference(DepartmentEntity, data.department) : undefined,
        priority: data.priority,
        isActive: data.isActive,
        ...audit,
      });
      em.create(ApprovalWorkflowVersionEntity, {
        workflow,
        version: 1,
        definition: defaultDefinition(),
        status: ApprovalWorkflowVersionStatus.Draft,
        ...audit,
      });
      await em.flush();
      return { id: workflow.id };
    });
  }

  async getWorkflowDetail(id: string) {
    const workflow = await this.repo.findOne(
      { id, deleted: { $ne: true } },
      { populate: ["requestType", "requestType.form", "department", "publishedVersion", "publishedVersion.publishedBy"] },
    );
    if (!workflow) throw new NotFoundException("Workflow not found");
    const draft = await this.findDraft(id);
    const versions = await this.getVersions(id);
    const published = workflow.publishedVersion;
    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      priority: workflow.priority,
      isActive: workflow.isActive,
      updatedAt: workflow.updatedAt,
      requestType: {
        id: workflow.requestType.id,
        code: workflow.requestType.code,
        name: workflow.requestType.name,
        formSchema: workflow.requestType.form.formSchema ?? [],
      },
      department: workflow.department ? { id: workflow.department.id, name: workflow.department.name } : null,
      publishedVersion: published
        ? {
            id: published.id,
            version: published.version,
            publishedAt: published.publishedAt,
            publishedBy: published.publishedBy ? { id: published.publishedBy.id, fullName: published.publishedBy.fullName } : null,
            definition: published.definition,
          }
        : null,
      draftVersion: draft ? { id: draft.id, version: draft.version, updatedAt: draft.updatedAt, definition: draft.definition } : null,
      versions,
    };
  }

  async updateWorkflow(id: string, data: UpdateApprovalWorkflowDto) {
    const workflow = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!workflow) throw new NotFoundException("Workflow not found");
    if (data.requestType) await this.ensureRequestType(data.requestType);
    const { requestType, department, description, ...rest } = data;
    this.em.assign(workflow, {
      ...rest,
      ...(description !== undefined && { description: description ?? null }),
      ...(requestType && { requestType: this.em.getReference(RequestTypeEntity, requestType) }),
      ...(department !== undefined && { department: department ? this.em.getReference(DepartmentEntity, department) : null }),
      ...this.getDefaultValuesForUpdate(),
    });
    await this.em.flush();
    return { id };
  }

  async deleteWorkflow(id: string) {
    return this.remove(id);
  }

  async getVersions(id: string) {
    return this.em.find(
      ApprovalWorkflowVersionEntity,
      { workflow: id, deleted: { $ne: true } },
      { fields: [...VERSION_FIELDS], populate: ["publishedBy"], orderBy: { version: "DESC" } },
    );
  }

  async getVersion(id: string, versionId: string) {
    const version = await this.em.findOne(ApprovalWorkflowVersionEntity, { id: versionId, workflow: id, deleted: { $ne: true } });
    if (!version) throw new NotFoundException("Version not found");
    return version;
  }

  /** Lưu bản nháp; chưa có nháp thì tạo phiên bản mới = max + 1 */
  async saveDraft(id: string, definition: WorkflowDefinition) {
    await this.getWorkflowOrFail(id);
    const draft = await this.findDraft(id);
    if (draft) {
      this.em.assign(draft, { definition, ...this.getDefaultValuesForUpdate() });
      await this.em.flush();
      return { id: draft.id, version: draft.version, updatedAt: draft.updatedAt };
    }
    const created = await this.createDraft(id, definition);
    return { id: created.id, version: created.version, updatedAt: created.updatedAt };
  }

  /** Lấy định nghĩa của một phiên bản cũ làm bản nháp */
  async restoreVersion(id: string, versionId: string) {
    const version = await this.getVersion(id, versionId);
    return this.saveDraft(id, workflowDefinitionSchema.parse(version.definition));
  }

  async validateWorkflow(id: string, definition?: WorkflowDefinition) {
    const workflow = await this.getWorkflowOrFail(id, true);
    const def = definition ?? (await this.findDraft(id))?.definition;
    if (!def) throw new BadRequestException("Workflow has no draft");
    const errors = await this.collectErrors(workflow, workflowDefinitionSchema.parse(def));
    return { valid: errors.length === 0, errors };
  }

  async simulateWorkflow(id: string, data: SimulateDto) {
    await this.getWorkflowOrFail(id);
    const def = data.definition ?? (await this.findDraft(id))?.definition ?? (await this.findPublished(id))?.definition;
    if (!def) throw new BadRequestException("Workflow has no definition");
    return this.engine.simulate(workflowDefinitionSchema.parse(def), data.payload, data.requesterId ?? this.getCurrentUser().id);
  }

  /** Xuất bản bản nháp: khóa dòng quy trình, lưu trữ bản đang chạy, đổi trạng thái bản nháp */
  async publishWorkflow(id: string) {
    const user = this.getCurrentUser();
    return this.em.transactional(async (em) => {
      const workflow = await em.findOne(ApprovalWorkflowEntity, { id, deleted: { $ne: true } }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!workflow) throw new NotFoundException("Workflow not found");
      await em.populate(workflow, ["requestType", "requestType.form"]);
      const draft = await em.findOne(ApprovalWorkflowVersionEntity, {
        workflow: id,
        status: ApprovalWorkflowVersionStatus.Draft,
        deleted: { $ne: true },
      });
      if (!draft) throw new ConflictException("Workflow has no draft to publish");

      const definition = workflowDefinitionSchema.parse(draft.definition);
      const errors = await this.collectErrors(workflow, definition);
      if (errors.length) throw new BadRequestException({ message: "Workflow is invalid", errors });

      await em.nativeUpdate(
        ApprovalWorkflowVersionEntity,
        { workflow: id, status: ApprovalWorkflowVersionStatus.Published },
        { status: ApprovalWorkflowVersionStatus.Archived },
      );
      const now = new Date();
      em.assign(draft, {
        definition,
        status: ApprovalWorkflowVersionStatus.Published,
        publishedAt: now,
        publishedBy: em.getReference(UserEntity, user.id),
        ...this.getDefaultValuesForUpdate(),
      });
      workflow.publishedVersion = draft;
      await em.flush();
      return { id: draft.id, version: draft.version, publishedAt: now };
    });
  }

  /* ================= HELPERS ================= */

  private async collectErrors(workflow: ApprovalWorkflowEntity, definition: WorkflowDefinition): Promise<GraphError[]> {
    const formFields = (workflow.requestType.form.formSchema ?? []).map((f) => f.key);
    const errors = validateGraph(definition, formFields);

    // Người cụ thể / nhóm phải còn ít nhất một người dùng đang hoạt động
    const resolver = new ApproverResolver(this.em);
    const noDeptContext = { requesterId: "", departmentId: "" };
    for (const node of definition.nodes) {
      const approvers: Approver[] =
        node.type === NodeType.Approval
          ? node.approver
            ? [node.approver]
            : []
          : node.type === NodeType.Parallel
            ? node.approvers
            : node.type === NodeType.Notify
              ? node.recipients
              : [];
      const skippable = (node.type === NodeType.Approval || node.type === NodeType.Parallel) && node.options.skipIfNoApprover;
      for (const approver of skippable ? [] : approvers) {
        if (approver.type !== ApproverType.SpecificUser && approver.type !== ApproverType.Principal) continue;
        if (!(await resolver.resolve(approver, noDeptContext)).length) {
          errors.push({ code: GraphErrorCode.InactiveUser, message: "Approver has no active user", nodeId: node.id });
          break;
        }
      }
    }
    return errors;
  }

  private async ensureRequestType(id: string) {
    const exists = await this.em.count(RequestTypeEntity, { id, deleted: { $ne: true } });
    if (!exists) throw new BadRequestException("Request type not found");
  }

  private async getWorkflowOrFail(id: string, withRequestType = false) {
    const workflow = await this.repo.findOne(
      { id, deleted: { $ne: true } },
      withRequestType ? { populate: ["requestType", "requestType.form"] } : {},
    );
    if (!workflow) throw new NotFoundException("Workflow not found");
    return workflow;
  }

  private findDraft(workflowId: string) {
    return this.em.findOne(ApprovalWorkflowVersionEntity, {
      workflow: workflowId,
      status: ApprovalWorkflowVersionStatus.Draft,
      deleted: { $ne: true },
    });
  }

  private findPublished(workflowId: string) {
    return this.em.findOne(ApprovalWorkflowVersionEntity, {
      workflow: workflowId,
      status: ApprovalWorkflowVersionStatus.Published,
      deleted: { $ne: true },
    });
  }

  private async createDraft(workflowId: string, definition: WorkflowDefinition) {
    const last = await this.em.findOne(
      ApprovalWorkflowVersionEntity,
      { workflow: workflowId },
      { orderBy: { version: "DESC" }, fields: ["version"] },
    );
    const draft = this.em.create(ApprovalWorkflowVersionEntity, {
      workflow: this.em.getReference(ApprovalWorkflowEntity, workflowId),
      version: (last?.version ?? 0) + 1,
      definition,
      status: ApprovalWorkflowVersionStatus.Draft,
      ...this.getDefaultValuesForCreate(),
    });
    await this.em.flush();
    return draft;
  }
}
