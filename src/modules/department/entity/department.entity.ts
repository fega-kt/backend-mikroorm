import { BaseEntity } from "@common/base/base.entity";
import { Collection, Entity, Index, ManyToOne, OneToMany, Property, types } from "@mikro-orm/core";
import { UserEntity } from "@modules/user/entity/user.entity";

@Entity({ collection: "departments" })
export class DepartmentEntity extends BaseEntity {
  @Property({ unique: true })
  code!: string;

  @Property()
  name!: string;

  @ManyToOne({ cascade: [], entity: () => DepartmentEntity, nullable: true })
  parent?: DepartmentEntity;

  @Index()
  @Property({ type: types.string, nullable: true })
  parentCode?: string; // path code từ parent đến nó

  @OneToMany({ cascade: [], entity: () => UserEntity, mappedBy: "department" })
  users = new Collection<UserEntity>(this);
}
