import { BaseEntity } from "@common/base/base.entity";
import { UserEntity } from "@core-service/entities/user";
import { Collection, Entity, Index, ManyToMany, ManyToOne, Property, types } from "@mikro-orm/core";
import { ApprovalRequestEntity } from "../approval-request/approval-request.entity";

/**
 * Bình luận trong tờ trình. Người viết là `createdBy`. Khác nhật ký (`approval_histories`, chỉ ghi thêm):
 * bình luận sửa được (ghi `editedAt`) và xóa mềm bằng `deleted` — bình luận gốc đã xóa vẫn giữ chỗ (bỏ nội dung) để phản hồi bên dưới còn ngữ cảnh.
 */
@Entity({ tableName: "approval_comments" })
@Index({ properties: ["request", "createdAt"] })
export class ApprovalCommentEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => ApprovalRequestEntity })
  request!: ApprovalRequestEntity;

  /** Vòng duyệt của tờ trình lúc viết (phiếu bị trả lại rồi trình lại thì sang vòng mới) */
  @Property({ type: types.integer })
  round!: number;

  /** Bình luận được trả lời — chỉ một cấp: phản hồi luôn trỏ về bình luận gốc */
  @Index()
  @ManyToOne({ cascade: [], entity: () => ApprovalCommentEntity, nullable: true })
  parent?: ApprovalCommentEntity;

  @Property({ type: types.text })
  content!: string;

  /** Người được nhắc (@mention); nội dung chỉ chứa chữ hiển thị */
  @ManyToMany({ cascade: [], entity: () => UserEntity, pivotTable: "approval_comment_mentions" })
  mentions = new Collection<UserEntity>(this);

  @Property({ type: types.datetime, nullable: true })
  editedAt?: Date;
}
