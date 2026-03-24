import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, ManyToOne, Property, types } from "@mikro-orm/core";
import { ProjectEntity } from "@modules/project/entity/project.entity";
import { UserEntity } from "@modules/user/entity/user.entity";

export enum TaskStatus {
  TODO = "TODO",
  IN_PROGRESS = "IN_PROGRESS",
  DONE = "DONE",
  CANCELLED = "CANCELLED",
}

export enum TaskPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

@Entity({ collection: "tasks" })
export class TaskEntity extends BaseEntity {
  @Property({ type: types.string })
  title!: string;

  @Property({ type: types.string })
  description!: string;

  @ManyToOne({ cascade: [], entity: () => ProjectEntity })
  project!: ProjectEntity;

  @Enum(() => TaskStatus)
  status!: TaskStatus;

  @Enum(() => TaskPriority)
  priority!: TaskPriority;

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  assignee!: UserEntity;

  @Property({ type: Date, nullable: true })
  startDate?: Date;

  @Property({ type: Date, nullable: true })
  dueDate?: Date;

  @Property({ type: Date, nullable: true })
  completedAt?: Date;

  @Property({ type: types.integer, default: 0 })
  order: number = 0;
}
