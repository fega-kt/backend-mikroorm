import { ManyToOne, PrimaryKey, Property, SerializedPrimaryKey } from "@mikro-orm/core";
import { ObjectId } from "@mikro-orm/mongodb";
import { IUser } from "@modules/user/entity/user";
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

  @ManyToOne("UserEntity", {
    cascade: [],
  })
  createdBy!: IUser;

  @ManyToOne("UserEntity", {
    cascade: [],
  })
  updatedBy!: IUser;
}
