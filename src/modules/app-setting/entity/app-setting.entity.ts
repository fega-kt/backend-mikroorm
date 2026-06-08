import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Property, Unique } from "@mikro-orm/core";
import { AppSettingType } from "../enum/app-setting-type.enum";

export { AppSettingType };

@Entity({ tableName: "app_settings" })
export class AppSettingEntity extends BaseEntity {
  @Enum(() => AppSettingType)
  @Unique()
  key!: AppSettingType;

  @Property({ type: "any" })
  value!: string | number | boolean | Record<string, unknown> | unknown[];

  @Property({ nullable: true })
  description?: string;
}
