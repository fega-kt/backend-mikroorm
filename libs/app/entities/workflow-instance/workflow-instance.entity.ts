import { BaseEntity } from "@common/base/base.entity";
import { UserEntity } from "@core-service/entities/user";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { RequestTypeEntity } from "../request-type/request-type.entity";
import { WfApprovalData, WorkflowSettingEntity } from "../workflow-setting/workflow-setting.entity";

export enum WorkflowInstanceStatus {
  Draft = "draft",
  InProgress = "in_progress",
  Approved = "approved",
  Rejected = "rejected",
  Returned = "returned",
  Cancelled = "cancelled",
  /** A request-to-cancel sub-flow is pending approval — see WorkflowActionsService.requestToCancel */
  WaitingForCancellation = "waiting_for_cancellation",
}

@Entity({ tableName: "workflow_instances" })
export class WorkflowInstanceEntity extends BaseEntity {
  /** Auto-generated request code, e.g. "TEST-2026-0007" — only set when requestType is provided */
  @Property({ type: types.string, nullable: true })
  code?: string;

  @Property({ type: types.integer, nullable: true })
  counter?: number;

  @Property({ type: types.string, nullable: true })
  counterCode?: string;

  @Property({ type: types.string })
  title!: string;

  @Property({ type: types.text, nullable: true })
  content?: string;

  @Index()
  @ManyToOne({ cascade: [], entity: () => UserEntity })
  requester!: UserEntity;

  @Index()
  @ManyToOne({ cascade: [], entity: () => RequestTypeEntity, nullable: true })
  requestType?: RequestTypeEntity;

  @ManyToOne({ cascade: [], entity: () => WorkflowSettingEntity })
  workflowSetting!: WorkflowSettingEntity;

  /** Snapshot of workflowSetting.approvalConfig taken at submit time, so later template edits don't affect in-flight instances */
  @Property({ type: "json", nullable: true })
  workflowSnapshot?: Record<string, WfApprovalData>;

  @Enum({ items: () => WorkflowInstanceStatus, default: WorkflowInstanceStatus.Draft })
  status: WorkflowInstanceStatus = WorkflowInstanceStatus.Draft;

  @Index()
  @Property({ type: types.string, nullable: true })
  processInstanceId?: string;

  @Property({ type: types.string, nullable: true })
  processDefinitionKey?: string;

  /** Denormalized projection, refreshed by syncing tasks from Flowable after each action or push callback */
  @Property({ type: types.string, nullable: true })
  currentStepName?: string;

  @Property({ type: "json", nullable: true })
  currentApproverIds?: string[];

  /** Set whenever currentStepName changes — used for overdue/SLA tracking */
  @Property({ type: types.datetime, nullable: true })
  currentStepStartDate?: Date;

  @Property({ type: types.datetime, nullable: true })
  submittedAt?: Date;

  @Property({ type: types.datetime, nullable: true })
  completedAt?: Date;
}
