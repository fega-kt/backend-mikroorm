import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, ManyToOne, Property } from "@mikro-orm/core";
import { UserEntity } from "@modules/user/entity/user.entity";
import { ProjectEntity } from "./project.entity";

export enum ProjectMemberRole {
  PM = "PM",
  TEAM_LEAD = "TEAM_LEAD",
  MEMBER = "MEMBER",
  VIEWER = "VIEWER",
}

@Entity({ collection: "project_members" })
export class ProjectMemberEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => ProjectEntity })
  project!: ProjectEntity;

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  user!: UserEntity;

  @Enum(() => ProjectMemberRole)
  role!: ProjectMemberRole;

  @Property({ type: Date, onCreate: () => new Date() })
  joinedAt: Date = new Date();
}
