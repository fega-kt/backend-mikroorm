import { BaseEntity } from "@common/base/base.entity";
import { UserEntity } from "@core-service/entities/user";
import { Entity, Enum, ManyToOne, Property, types, Unique } from "@mikro-orm/core";
import type { WorkflowDefinition } from "../../services/approval-engine/definition.schema";
import { ApprovalWorkflowEntity } from "../approval-workflow/approval-workflow.entity";

export enum ApprovalWorkflowVersionStatus {
  Draft = "draft",
  Published = "published",
  Archived = "archived",
}

/**
 * Một phiên bản định nghĩa quy trình. Mỗi quy trình có tối đa 1 bản nháp và 1 bản đang chạy;
 * bản đã xuất bản không bao giờ bị sửa — đơn đang chạy luôn trỏ tới đúng phiên bản lúc gửi.
 */
@Entity({ tableName: "approval_workflow_versions" })
@Unique({ properties: ["workflow", "version"] })
export class ApprovalWorkflowVersionEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => ApprovalWorkflowEntity })
  workflow!: ApprovalWorkflowEntity;

  @Property({ type: types.integer })
  version!: number;

  @Property({ type: types.json })
  definition!: WorkflowDefinition;

  @Enum({ items: () => ApprovalWorkflowVersionStatus, default: ApprovalWorkflowVersionStatus.Draft })
  status: ApprovalWorkflowVersionStatus = ApprovalWorkflowVersionStatus.Draft;

  @Property({ type: types.datetime, nullable: true })
  publishedAt?: Date;

  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  publishedBy?: UserEntity;
}
