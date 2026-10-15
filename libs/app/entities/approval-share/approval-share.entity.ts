import { BaseEntity } from "@common/base/base.entity";
import { PrincipalEntity } from "@core-service/entities/principal";
import { Entity, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { ApprovalRequestEntity } from "../approval-request/approval-request.entity";

/**
 * Chia sẻ tờ trình (chỉ xem) cho một người hoặc nhóm. Người chia sẻ là `createdBy`.
 * Thu hồi = xóa mềm (`deleted`): giữ lại ai chia sẻ cho ai, lúc nào, lời nhắn gì. Mọi chỗ đọc chỉ lấy dòng chưa xóa.
 * Không đặt unique (request, principal): chia sẻ lại sau khi thu hồi tạo dòng mới, việc không trùng do service kiểm tra.
 */
@Entity({ tableName: "approval_shares" })
@Index({ properties: ["request", "principal"] })
export class ApprovalShareEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => ApprovalRequestEntity })
  request!: ApprovalRequestEntity;

  @Index()
  @ManyToOne({ cascade: [], entity: () => PrincipalEntity })
  principal!: PrincipalEntity;

  /** Lời nhắn người chia sẻ gửi kèm */
  @Property({ type: types.text, nullable: true })
  message?: string;
}
