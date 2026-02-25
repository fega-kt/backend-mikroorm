import { Entity, Property } from "@mikro-orm/core";
import { BaseEntity } from "../../common/base/base.entity";

@Entity()
export class UserEntity extends BaseEntity {
  @Property({ unique: true })
  email!: string;

  @Property()
  password!: string;
}
