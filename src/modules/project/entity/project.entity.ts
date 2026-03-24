import { BaseEntity } from "@common/base/base.entity";
import { Entity, ManyToOne, Property, types } from "@mikro-orm/core";
import { UserEntity } from "@modules/user/entity/user.entity";

@Entity({ collection: "projects" })
export class ProjectEntity extends BaseEntity {
  @Property({ type: types.string })
  name!: string;

  @Property({ type: types.string, nullable: true })
  description?: string;

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  owner!: UserEntity;

  @Property({ type: Date })
  startDate!: Date;

  @Property({ type: Date })
  dueDate!: Date;
}
