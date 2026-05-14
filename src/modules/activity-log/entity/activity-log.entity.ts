import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Property, types } from "@mikro-orm/core";

export enum ActivityLogType {
  System = "system",
  User = "user",
}

export enum ActivityLogAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  RESTORE = "RESTORE",
  STATUS_CHANGE = "STATUS_CHANGE",
  ASSIGN = "ASSIGN",
  APPROVE = "APPROVE",
  REJECT = "REJECT",
  CHANGE_PASSWORD = "CHANGE_PASSWORD",
}

@Entity({ collection: "activity_logs" })
export class ActivityLogEntity extends BaseEntity {
  @Property({ type: types.string })
  parentId!: string;

  @Enum(() => ActivityLogAction)
  action!: ActivityLogAction;

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
