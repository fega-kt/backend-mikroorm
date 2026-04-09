import { BaseEntity } from "@common/base/base.entity";
import { Entity, ManyToOne, Property, types } from "@mikro-orm/core";
import { ProjectEntity } from "./project.entity";

@Entity({ collection: "sections" })
export class SectionEntity extends BaseEntity {
  @Property({ type: types.string })
  name!: string;

  @ManyToOne({ cascade: [], entity: () => ProjectEntity })
  project!: ProjectEntity;

  @Property({ type: types.integer, default: 0 })
  order: number = 0;
}
