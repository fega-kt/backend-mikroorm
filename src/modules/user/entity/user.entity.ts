import { BaseEntity } from "@common/base/base.entity";
import { Entity, ManyToOne, Property } from "@mikro-orm/core";
import { DepartmentEntity } from "@modules/department/entity/department.entity";

@Entity({ collection: "users" })
export class UserEntity extends BaseEntity {
  @Property({ unique: true })
  email!: string;

  @Property()
  password!: string;

  @Property()
  name!: string;

  @ManyToOne({ cascade: [], entity: () => DepartmentEntity })
  department: DepartmentEntity;

  @Property({ default: false })
  isActive: boolean = false;
}
