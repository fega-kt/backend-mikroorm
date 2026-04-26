import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, ManyToOne, Property, types } from "@mikro-orm/core";
import { ProjectEntity } from "@modules/project/entity/project.entity";

export enum SprintStatus {
  PLANNING = "PLANNING",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

@Entity({ collection: "sprints" })
export class SprintEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => ProjectEntity })
  project!: ProjectEntity;

  @Property({ type: types.string })
  name!: string;

  @Property({ type: types.string, nullable: true })
  goal?: string;

  @Property({ type: Date })
  startDate!: Date;

  @Property({ type: Date })
  endDate!: Date;

  @Enum(() => SprintStatus)
  status!: SprintStatus;
}
