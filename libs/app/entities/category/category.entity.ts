import { BaseEntity } from "@common/base/base.entity";
import { PublicUrlType } from "@common/base/public-url.type";
import { Entity, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { DepartmentEntity } from "@core-service/entities/department";

@Entity({ tableName: "categories" })
export class CategoryEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => DepartmentEntity })
  department!: DepartmentEntity;

  @Property({ unique: true, type: types.string })
  code!: string;

  @Property({ type: types.string })
  name!: string;

  /** DB lưu key trên R2, đọc ra là link đầy đủ theo R2_PUBLIC_URL */
  @Property({ type: PublicUrlType, nullable: true })
  icon?: string;
}
