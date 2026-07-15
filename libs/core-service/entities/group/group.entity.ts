import { BaseEntity } from "@common/base/base.entity";
import { Collection, Entity, ManyToMany, OneToOne, Property, types } from "@mikro-orm/core";
import { PrincipalEntity } from "../principal/principal.entity";
import { UserEntity } from "../user/user.entity";

@Entity({ tableName: "groups" })
export class GroupEntity extends BaseEntity {
  @Property()
  name!: string;

  @OneToOne({
    cascade: [],
    entity: () => PrincipalEntity,
    mappedBy: "group",
  })
  principal!: PrincipalEntity;

  @ManyToMany({ cascade: [], entity: () => UserEntity, mappedBy: "groups", nullable: true })
  users = new Collection<UserEntity>(this);

  @Property({ type: types.text, nullable: true })
  description?: string;
}
