import { BaseEntity } from "@common/base/base.entity";
import { PrincipalEntity } from "@core-service/entities/principal";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { WorkflowInstanceEntity } from "../workflow-instance/workflow-instance.entity";

export enum WorkflowTaskStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Returned = "returned",
  Cancelled = "cancelled",
}

@Entity({ tableName: "workflow_tasks" })
export class WorkflowTaskEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => WorkflowInstanceEntity })
  workflowInstance!: WorkflowInstanceEntity;

  /** WfNode.id from the template's workflowDefinition this task corresponds to */
  @Property({ type: types.string })
  nodeId!: string;

  @Property({ type: types.string })
  stepName!: string;

  @Index()
  @ManyToOne({ cascade: [], entity: () => PrincipalEntity })
  approver!: PrincipalEntity;

  /** Flowable's own task id — required to call complete/claim on the Flowable REST API. Cancellation-approval
   *  tasks (see WorkflowActionsService.requestToCancel) have none — they never touch the engine. */
  @Index()
  @Property({ type: types.string, nullable: true })
  flowableTaskId?: string;

  @Enum({ items: () => WorkflowTaskStatus, default: WorkflowTaskStatus.Pending })
  status: WorkflowTaskStatus = WorkflowTaskStatus.Pending;

  @Property({ type: types.text, nullable: true })
  comment?: string;

  @Property({ type: types.datetime, nullable: true })
  startDate?: Date;

  /** No SLA-duration config exists on the template yet, so this is never computed — reserved for later use */
  @Property({ type: types.datetime, nullable: true })
  dueDate?: Date;

  @Property({ type: types.datetime, nullable: true })
  completedAt?: Date;

  /** RFI — set by requestToChange, cleared by applyChange. While true, approve/reject/return are blocked. */
  @Property({ type: types.boolean, default: false })
  isPending: boolean = false;

  @Property({ type: types.text, nullable: true })
  pendingComment?: string;

  /** Review subtask parent — set only on tasks created by WorkflowActionsService.requestReview */
  @ManyToOne({ cascade: [], entity: () => WorkflowTaskEntity, nullable: true })
  parentTask?: WorkflowTaskEntity;
}
