import { BaseEntity } from "@common/base/base.entity";
import { Entity, Index, ManyToOne, Property, types, Unique } from "@mikro-orm/core";
import { ApprovalRequestFileEntity } from "../approval-request-file/approval-request-file.entity";

/** Vị trí khung chữ ký (điểm PDF, gốc dưới-trái) */
export interface SignSlotPlacement {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Vị trí ký người trình đặt sẵn cho một bước duyệt trên một văn bản PDF của tờ trình.
 * Gắn với dòng tệp của vòng (xóa tệp thì xóa theo) và bước (nodeId) — lúc soạn chưa biết ai sẽ duyệt.
 * Khi ký: vị trí người duyệt tự dời (nếu không khóa) > ô đặt sẵn > tự xếp ở chân trang cuối.
 */
@Entity({ tableName: "approval_file_sign_slots" })
@Unique({ properties: ["requestFile", "nodeId", "slot"] })
export class ApprovalFileSignSlotEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], deleteRule: "cascade", entity: () => ApprovalRequestFileEntity })
  requestFile!: ApprovalRequestFileEntity;

  /** Bước (node) trong phiên bản quy trình */
  @Property({ type: types.string })
  nodeId!: string;

  /** Thứ tự suất trong bước; 0 là ô dùng chung của cả bước */
  @Property({ type: types.integer, default: 0 })
  slot: number = 0;

  @Property({ type: types.json })
  placement!: SignSlotPlacement;

  /** Khóa: người duyệt không được dời khung */
  @Property({ type: types.boolean, default: false })
  locked: boolean = false;
}
