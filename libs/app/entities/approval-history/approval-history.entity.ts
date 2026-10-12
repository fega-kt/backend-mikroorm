import { BaseEntity } from "@common/base/base.entity";
import { UserEntity } from "@core-service/entities/user";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { ApprovalRequestEntity } from "../approval-request/approval-request.entity";

export enum ApprovalHistoryAction {
  Submit = "submit",
  Resubmit = "resubmit",
  Approve = "approve",
  Reject = "reject",
  Return = "return",
  Cancel = "cancel",
  Skip = "skip",
  AutoApprove = "auto_approve",
  Delegate = "delegate",
  Escalate = "escalate",
  Remind = "remind",
  Notify = "notify",
  Complete = "complete",
}

/** Nhật ký thao tác của đơn — nguồn dữ liệu cho timeline ở màn chi tiết đơn (append-only) */
@Entity({ tableName: "approval_histories" })
export class ApprovalHistoryEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => ApprovalRequestEntity })
  request!: ApprovalRequestEntity;

  @Enum({ items: () => ApprovalHistoryAction })
  action!: ApprovalHistoryAction;

  /** null → hệ thống (cron SLA, bỏ qua tự động) */
  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  actor?: UserEntity;

  @Property({ type: types.string, nullable: true })
  nodeId?: string;

  @Property({ type: types.string, nullable: true })
  nodeName?: string;

  @Property({ type: types.text, nullable: true })
  comment?: string;

  @Property({ type: types.json, nullable: true })
  data?: Record<string, unknown>;
}
