import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { WorkflowInstanceEntity } from "../workflow-instance/workflow-instance.entity";
import { WorkflowTaskEntity } from "../workflow-task/workflow-task.entity";

export enum WorkflowActionType {
  StartWorkflow = "start_workflow",
  ApproveTask = "approve_task",
  RejectTask = "reject_task",
  ReturnTask = "return_task",
  CancelWorkflow = "cancel_workflow",
  /** RFI — request additional info / requester supplies it */
  RequestToChange = "request_to_change",
  ApplyChange = "apply_change",
  /** Review subtask — advisory, doesn't affect the parent task's own approve/reject */
  CreateReviewTask = "create_review_task",
  SubmitReview = "submit_review",
  /** Cancel sub-flow */
  RequestToCancel = "request_to_cancel",
  ApproveCancellation = "approve_cancellation",
  RejectCancellation = "reject_cancellation",
}

/** Append-only audit trail of every action taken on a workflow instance — actor comes from BaseEntity.createdBy */
@Entity({ tableName: "workflow_actions" })
export class WorkflowActionEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => WorkflowInstanceEntity })
  workflowInstance!: WorkflowInstanceEntity;

  @ManyToOne({ cascade: [], entity: () => WorkflowTaskEntity, nullable: true })
  workflowTask?: WorkflowTaskEntity;

  @Enum(() => WorkflowActionType)
  actionType!: WorkflowActionType;

  @Property({ type: types.text, nullable: true })
  comment?: string;
}
