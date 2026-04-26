import { BaseEntity } from "@common/base/base.entity";
import { Collection, Entity, Enum, ManyToMany, ManyToOne, Property, types } from "@mikro-orm/core";
import { ProjectEntity } from "@modules/project/entity/project.entity";
import { SectionEntity } from "@modules/project/entity/section.entity";
import { SprintEntity } from "@modules/sprint/entity/sprint.entity";
import { AttachmentEntity } from "@modules/upload/entity/attachment.entity";
import { UserEntity } from "@modules/user/entity/user.entity";

export enum TaskStatus {
  DRAFT = "DRAFT",
  TODO = "TODO",
  IN_PROGRESS = "IN_PROGRESS",
  DONE = "DONE",
  CANCELLED = "CANCELLED",
  REJECTED = "REJECTED",
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

  @ManyToOne({ cascade: [], entity: () => SectionEntity, nullable: true })
  section?: SectionEntity;

  @ManyToOne({ cascade: [], entity: () => SprintEntity, nullable: true })
  sprint?: SprintEntity;

  @ManyToOne({ cascade: [], entity: () => TaskEntity, nullable: true })
  parentTask?: TaskEntity;

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

  @Property({ type: types.float, nullable: true })
  estimatedHours?: number;

  @Property({ type: types.float, nullable: true })
  actualHours?: number;

  @Property({ type: types.array, nullable: true })
  labels?: string[];

  /** Materialized path: /<id> hoặc /<parentId>/.../<id> */
  @Property({ type: types.string })
  path!: string;

  @ManyToMany({ entity: () => AttachmentEntity, cascade: [] })
  attachments = new Collection<AttachmentEntity>(this);
}
