import { BaseEntity } from "@common/base/base.entity";
import { UserEntity } from "@core-service/entities/user";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { RequestTypeEntity } from "../request-type/request-type.entity";

/** Kiểu ủy quyền */
export enum ApprovalDelegationMode {
  /** Trong thời gian ủy quyền, toUser xử lý được mọi phiếu đang chờ fromUser (cả phiếu đến trước); hết hạn là hết quyền */
  Window = "window",
  /** Phiếu đến tay fromUser trong thời gian ủy quyền được giao cho toUser xử lý đến khi xong, kể cả sau khi hết hạn */
  Handover = "handover",
}

/**
 * Ủy quyền duyệt: toUser được xử lý thay task của fromUser (task vẫn thuộc fromUser, fromUser vẫn tự duyệt được).
 * Người có quyền quản lý ủy quyền có thể tạo hộ (createdBy ≠ fromUser).
 */
@Entity({ tableName: "approval_delegations" })
@Index({ properties: ["fromUser", "startAt", "endAt"] })
@Index({ properties: ["toUser", "startAt", "endAt"] })
export class ApprovalDelegationEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => UserEntity })
  fromUser!: UserEntity;

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  toUser!: UserEntity;

  @Property({ type: types.datetime })
  startAt!: Date;

  @Property({ type: types.datetime })
  endAt!: Date;

  @Enum({ items: () => ApprovalDelegationMode, default: ApprovalDelegationMode.Window })
  mode: ApprovalDelegationMode = ApprovalDelegationMode.Window;

  /** null → áp dụng cho mọi loại đơn */
  @ManyToOne({ cascade: [], entity: () => RequestTypeEntity, nullable: true })
  requestType?: RequestTypeEntity;

  @Property({ type: types.text, nullable: true })
  reason?: string;
}
