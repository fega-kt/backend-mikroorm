import { BaseEntity } from "@common/base/base.entity";
import { PrincipalEntity } from "@core-service/entities/principal";
import { UserEntity } from "@core-service/entities/user";
import { Collection, Entity, Enum, Index, ManyToMany, ManyToOne, Property, types } from "@mikro-orm/core";
import { ApprovalDelegationEntity } from "../approval-delegation/approval-delegation.entity";
import { ApprovalRequestEntity } from "../approval-request/approval-request.entity";

export enum ApprovalTaskStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Returned = "returned",
  Skipped = "skipped",
}

/** Một suất chờ duyệt tại một bước (bước song song sinh nhiều task, mỗi suất một task) */
@Entity({ tableName: "approval_tasks" })
@Index({ properties: ["approver", "status"] })
@Index({ properties: ["status", "dueAt"] })
export class ApprovalTaskEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => ApprovalRequestEntity })
  request!: ApprovalRequestEntity;

  @Property({ type: types.integer })
  round!: number;

  @Property({ type: types.string })
  nodeId!: string;

  @Property({ type: types.string, nullable: true })
  nodeName?: string;

  /**
   * Suất duyệt trong bước = vị trí người duyệt trong cấu hình. Nhóm sinh nhiều task cùng suất,
   * một người duyệt là đủ suất đó. null (dữ liệu cũ) → mỗi task là một suất riêng.
   */
  @Property({ type: types.integer, nullable: true })
  slot?: number;

  /** Người duyệt theo quy trình (principal người hoặc nhóm) — không đổi suốt vòng đời task */
  @ManyToOne({ cascade: [], entity: () => PrincipalEntity, fieldName: "origin_approver_id" })
  originApprover!: PrincipalEntity;

  /**
   * Người / nhóm đang giữ task (principal):
   * - Bằng `originApprover`: giao cho người đó, hoặc nhóm "cùng xử lý" (thành viên hiện tại nào cũng xử lý được).
   * - Principal người khác: nhóm "chia cho một người" (`assignedFromGroup`), gán lại, chuyển cấp.
   * Ủy quyền áp dụng khi đây là principal người.
   */
  @ManyToOne({ cascade: [], entity: () => PrincipalEntity, fieldName: "approver_principal_id" })
  approver!: PrincipalEntity;

  /** Task nhóm được hệ thống chia ngẫu nhiên cho một thành viên — người đó rời nhóm / bị khóa thì cron chia lại */
  @Property({ type: types.boolean, default: false })
  assignedFromGroup: boolean = false;

  /** Chụp tùy chọn "cho phép ủy quyền" của bước lúc tạo task — để lọc hộp chờ duyệt bằng SQL */
  @Property({ type: types.boolean, default: false })
  delegable: boolean = false;

  /** Ủy quyền kiểu "giao phiếu" đang hiệu lực lúc task được tạo: người được ủy quyền xử lý thay đến khi xong */
  @ManyToMany({ cascade: [], entity: () => ApprovalDelegationEntity, pivotTable: "approval_task_handover_delegations" })
  handoverDelegations = new Collection<ApprovalDelegationEntity>(this);

  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  actedBy?: UserEntity;

  @Enum({ items: () => ApprovalTaskStatus, default: ApprovalTaskStatus.Pending })
  status: ApprovalTaskStatus = ApprovalTaskStatus.Pending;

  @Property({ type: types.text, nullable: true })
  comment?: string;

  @Property({ type: types.datetime, nullable: true })
  dueAt?: Date;

  @Property({ type: types.datetime, nullable: true })
  remindedAt?: Date;

  @Property({ type: types.datetime, nullable: true })
  escalatedAt?: Date;

  @Property({ type: types.datetime, nullable: true })
  actedAt?: Date;
}
