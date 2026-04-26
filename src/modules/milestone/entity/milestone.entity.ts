import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, ManyToOne, Property, types } from "@mikro-orm/core";
import { ProjectEntity } from "@modules/project/entity/project.entity";

export enum MilestoneStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  MISSED = "MISSED",
}

@Entity({ collection: "milestones" })
export class MilestoneEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => ProjectEntity })
  project!: ProjectEntity;

  @Property({ type: types.string })
  name!: string;

  @Property({ type: types.string, nullable: true })
  description?: string;

  @Property({ type: Date })
  dueDate!: Date;

  @Enum(() => MilestoneStatus)
  status!: MilestoneStatus;

  @Property({ type: Date, nullable: true })
  completedAt?: Date;
}
