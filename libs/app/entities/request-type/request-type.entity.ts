import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import type { FormSchema } from "../../services/approval-engine/form-schema";
import { CategoryEntity } from "../category/category.entity";

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

  @Property({ type: types.text, nullable: true })
  description?: string;

  /** Định nghĩa form của đơn — FE sinh form, BE validate payload khi gửi */
  @Property({ type: types.json, nullable: true })
  formSchema?: FormSchema;

  @Enum({ items: () => RequestTypeStatus, default: RequestTypeStatus.Draft })
  status: RequestTypeStatus = RequestTypeStatus.Draft;
}
