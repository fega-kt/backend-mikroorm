import { Entity, Enum, Property, types } from "@mikro-orm/core";
import { BaseEntity } from "@common/base/base.entity";

export enum ActivityLogType {
  System = "system",
  User = "user",
}

@Entity({ collection: "activity-logs" })
export class ActivityLogEntity extends BaseEntity {
  @Property({ type: types.string })
  parentId!: string;

  @Property({ type: types.json, nullable: true })
  oldData?: Record<string, any>;

  @Property({ type: types.json, nullable: true })
  newData?: Record<string, any>;

  @Enum(() => ActivityLogType)
  type!: ActivityLogType;

  @Property({ type: types.string })
  ip!: string;

  @Property({ type: types.string })
  device!: string;
}
