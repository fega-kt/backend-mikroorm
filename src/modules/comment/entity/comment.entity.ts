import { BaseEntity } from "@common/base/base.entity";
import { Entity, ManyToOne, Property, types } from "@mikro-orm/core";
import { TaskEntity } from "@modules/task/entity/task.entity";

@Entity({ collection: "comments" })
export class CommentEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => TaskEntity })
  task!: TaskEntity;

  @Property({ type: types.string })
  content!: string;

  @ManyToOne({ cascade: [], entity: () => CommentEntity, nullable: true })
  parentComment?: CommentEntity;

  /** true nếu đã bị chỉnh sửa */
  @Property({ type: types.boolean, default: false })
  edited: boolean = false;
}
