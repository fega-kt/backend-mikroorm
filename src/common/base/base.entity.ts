import { ManyToOne, PrimaryKey, Property, SerializedPrimaryKey } from "@mikro-orm/core";
import { ObjectId } from "@mikro-orm/mongodb";
import { UserEntity } from "@modules/user/entity/user.entity";

export abstract class BaseEntity {
  @PrimaryKey()
  _id!: ObjectId;

  @SerializedPrimaryKey()
  id!: string;

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt = new Date();

  @Property({ default: false })
  deleted: boolean = false;

  @ManyToOne(() => UserEntity, { nullable: false })
  createdBy!: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: false })
  updatedBy!: UserEntity;
}
