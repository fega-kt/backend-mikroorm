import { BaseEntity } from "@common/base/base.entity";
import { Collection, Entity, Enum, ManyToMany, ManyToOne, OneToMany, Property, types } from "@mikro-orm/core";
import { AttachmentEntity } from "@modules/upload/entity/attachment.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { ProjectMemberEntity } from "./project-member.entity";

export enum ProjectStatus {
  PLANNING = "PLANNING",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  ON_HOLD = "ON_HOLD",
  ARCHIVED = "ARCHIVED",
}

export enum ProjectPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum ProjectVisibility {
  PUBLIC = "PUBLIC",
  PRIVATE = "PRIVATE",
}

@Entity({ collection: "projects" })
export class ProjectEntity extends BaseEntity {
  @Property({ type: types.string })
  name!: string;

  @Property({ type: types.string, nullable: true })
  description?: string;

  @Enum(() => ProjectStatus)
  status!: ProjectStatus;

  @Enum(() => ProjectPriority)
  priority!: ProjectPriority;

  @Enum(() => ProjectVisibility)
  visibility!: ProjectVisibility;

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  owner!: UserEntity;

  @Property({ type: Date })
  startDate!: Date;

  @Property({ type: Date })
  dueDate!: Date;

  @Property({ type: types.float, nullable: true })
  budget?: number;

  @Property({ type: types.array, nullable: true })
  tags?: string[];

  /** UUID do client sinh sẵn, dùng làm tên thư mục trên R2 */
  @Property({ type: types.string })
  folderId!: string;

  @OneToMany({ entity: () => ProjectMemberEntity, mappedBy: "project" })
  projectMembers = new Collection<ProjectMemberEntity>(this);

  @ManyToMany({ entity: () => AttachmentEntity, cascade: [] })
  attachments = new Collection<AttachmentEntity>(this);
}
