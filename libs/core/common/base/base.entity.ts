import { ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { v7 as uuidv7 } from "uuid";
import { type UserEntity } from "@core-service/entities/user";

export abstract class BaseEntity {
  @PrimaryKey({ type: "uuid" })
  id: string = uuidv7();

  @Property({ onCreate: () => new Date() })
  createdAt = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt = new Date();

  @Property({ default: false })
  deleted: boolean = false;

  @ManyToOne("UserEntity", { cascade: [] })
  createdBy!: UserEntity;

  @ManyToOne("UserEntity", { cascade: [] })
  updatedBy!: UserEntity;
}
