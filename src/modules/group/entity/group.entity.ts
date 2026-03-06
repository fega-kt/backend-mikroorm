import { BaseEntity } from "@common/base/base.entity";
import { Collection, Entity, ManyToMany, Property } from "@mikro-orm/core";
import { UserEntity } from "@modules/user/entity/user.entity";

@Entity({ collection: "groups" })
export class GroupEntity extends BaseEntity {
  @Property()
  name!: string;

  @ManyToMany({ cascade: [], entity: () => UserEntity })
  users = new Collection<UserEntity>(this);
}
