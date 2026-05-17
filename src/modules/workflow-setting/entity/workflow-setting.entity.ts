import { BaseEntity } from "@common/base/base.entity";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { Entity, Enum, ManyToOne, Property, types } from "@mikro-orm/core";

export enum WorkflowSettingStatus {
  Draft = "draft",
  Published = "published",
  Cancelled = "cancelled",
}

@Entity({ collection: "workflow_settings" })
export class WorkflowSettingEntity extends BaseEntity {
  @Property({ type: types.string })
  name!: string;

  @ManyToOne({ cascade: [], entity: () => CategoryEntity })
  category!: CategoryEntity;

  @Enum(() => WorkflowSettingStatus)
  status!: WorkflowSettingStatus;

  @Property({ type: types.string, nullable: true })
  description?: string;

  @Property({ type: types.string, nullable: true })
  bpmnXml?: string;
}
