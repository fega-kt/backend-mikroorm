import { BaseEntity } from "@common/base/base.entity";
import { DepartmentEntity } from "@modules/department/entity/department.entity";
import { Entity, Index, ManyToOne, Property, types } from "@mikro-orm/core";

@Entity({ tableName: "categories" })
export class CategoryEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => DepartmentEntity })
  department!: DepartmentEntity;

  @Property({ unique: true, type: types.string })
  code!: string;

  @Property({ type: types.string })
  name!: string;

  @Property({ type: types.string, nullable: true })
  icon?: string;
}
