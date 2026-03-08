import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, OneToOne, Property, types } from "@mikro-orm/core";
import { GroupEntity } from "@modules/group/entity/group.entity";
import { UserEntity } from "@modules/user/entity/user.entity";

export enum PrincipalType {
  User = "user",
  Group = "group",
}

@Entity({ collection: "principals" })
export class PrincipalEntity extends BaseEntity {
  @Property()
  name!: string;

  /** 
  * PrincipalType: 
  user: thì Principal là user, chỉ có user ở field user
  group: thì Principal là group, chỉ có group ở field group
  */
  @Enum(() => PrincipalType)
  public type?: PrincipalType;

  @OneToOne({
    cascade: [],
    entity: () => GroupEntity,
    nullable: true,
    default: [],
  })
  public group?: GroupEntity;

  @OneToOne({
    cascade: [],
    entity: () => UserEntity,
    nullable: true,
  })
  public user?: UserEntity;

  @Property({ type: types.string, nullable: true })
  description?: string;
}
