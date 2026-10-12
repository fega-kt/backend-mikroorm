import { BaseEntity } from "@common/base/base.entity";
import { UserEntity } from "@core-service/entities/user";
import { Entity, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { RequestTypeEntity } from "../request-type/request-type.entity";

/** Ủy quyền duyệt: trong khoảng thời gian, task của fromUser được giao cho toUser */
@Entity({ tableName: "approval_delegations" })
@Index({ properties: ["fromUser", "startAt", "endAt"] })
export class ApprovalDelegationEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => UserEntity })
  fromUser!: UserEntity;

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  toUser!: UserEntity;

  @Property({ type: types.datetime })
  startAt!: Date;

  @Property({ type: types.datetime })
  endAt!: Date;

  /** null → áp dụng cho mọi loại đơn */
  @ManyToOne({ cascade: [], entity: () => RequestTypeEntity, nullable: true })
  requestType?: RequestTypeEntity;

  @Property({ type: types.text, nullable: true })
  reason?: string;
}
