import { BaseEntity } from "@common/base/base.entity";
import { Collection, Entity, ManyToMany, ManyToOne, OneToOne, Property, types } from "@mikro-orm/core";
import { DepartmentEntity } from "@modules/department/entity/department.entity";
import { GroupEntity } from "@modules/group/entity/group.entity";
import { PrincipalEntity } from "@modules/principal/entity/principal.entity";

@Entity({ collection: "users" })
export class UserEntity extends BaseEntity {
  @Property({ unique: true, type: types.string })
  loginName!: string;

  @Property({ type: types.string, nullable: true })
  workEmail?: string;

  @Property({ type: types.string })
  fullName!: string;

  @Property({ type: types.string, nullable: true })
  avatar?: string;

  @ManyToOne({ cascade: [], entity: () => DepartmentEntity })
  department: DepartmentEntity;

  @OneToOne({
    cascade: [],
    entity: () => PrincipalEntity,
    mappedBy: "user",
  })
  public principal!: PrincipalEntity;

  @ManyToMany({ cascade: [], entity: () => GroupEntity, inversedBy: "users" })
  public groups = new Collection<GroupEntity>(this);
}
