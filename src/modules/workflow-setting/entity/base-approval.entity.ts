import { BaseEntity } from "@common/base/base.entity";
import { Index, Property } from "@mikro-orm/core";

export abstract class BaseApprovalEntity extends BaseEntity {
  @Property({ length: 64 })
  processDefKey!: string;

  @Index()
  @Property({ nullable: true, length: 64 })
  processInstanceId?: string;

  @Property({ nullable: true, unique: true, length: 128 })
  idempotencyKey?: string;
}
