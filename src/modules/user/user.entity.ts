import { Entity, ManyToOne, Property } from "@mikro-orm/core";
import { DepartmentEntity } from "@modules/department/department.entity";
import { BaseEntity } from "../../common/base/base.entity";

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
}
