import { BaseEntity } from "@common/base/base.entity";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";

export enum RequestTypeStatus {
  Draft = "draft",
  Published = "published",
  Cancelled = "cancelled",
}

@Entity({ tableName: "request_types" })
export class RequestTypeEntity extends BaseEntity {
  @Property({ unique: true, type: types.string })
  code!: string;

  @Property({ type: types.string })
  name!: string;

  @Index()
  @ManyToOne({ cascade: [], entity: () => CategoryEntity })
  category!: CategoryEntity;

  @Property({ type: types.string })
  prefix!: string;

  @Property({ type: types.string, nullable: true })
  description?: string;

  @Enum({ items: () => RequestTypeStatus, default: RequestTypeStatus.Draft })
  status: RequestTypeStatus = RequestTypeStatus.Draft;
}
