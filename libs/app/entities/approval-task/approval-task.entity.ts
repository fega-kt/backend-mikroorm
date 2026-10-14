import { BaseEntity } from "@common/base/base.entity";
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

/** Một lượt chờ duyệt của một người tại một bước (bước song song sinh nhiều task) */
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

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  approver!: UserEntity;

  /**
   * Người duyệt trước khi task bị chuyển hẳn sang `approver` (gán lại / chuyển cấp; dữ liệu cũ: ủy quyền).
   * Ủy quyền hiện không chuyển task — người được ủy quyền chỉ được xử lý thay, xem `delegable` / `handoverDelegations`.
   */
  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  originalApprover?: UserEntity;

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
