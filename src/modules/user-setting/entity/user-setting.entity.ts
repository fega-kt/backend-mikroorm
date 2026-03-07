import { BaseEntity } from "@common/base/base.entity";
import { Entity, OneToOne, Property } from "@mikro-orm/core";
import { UserEntity } from "@modules/user/entity/user.entity";

@Entity({ collection: "user-settings" })
export class UserSettingEntity extends BaseEntity {
  @Property()
  password!: string;

  @OneToOne({ cascade: [], entity: () => UserEntity })
  user: UserEntity;

  @Property({ default: false })
  isActive: boolean = false;
}
