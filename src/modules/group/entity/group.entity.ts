import { BaseEntity } from "@common/base/base.entity";
import { Collection, Entity, ManyToMany, OneToOne, Property, types } from "@mikro-orm/core";
import { PrincipalEntity } from "@modules/principal/entity/principal.entity";
import { UserEntity } from "@modules/user/entity/user.entity";

@Entity({ collection: "groups" })
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

  @Property({ type: types.string, nullable: true })
  description?: string;
}
