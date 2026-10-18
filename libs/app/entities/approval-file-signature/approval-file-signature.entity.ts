import { BaseEntity } from "@common/base/base.entity";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { UserEntity } from "@core-service/entities/user";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { ApprovalRequestEntity } from "../approval-request/approval-request.entity";
import { ApprovalRequestFileEntity } from "../approval-request-file/approval-request-file.entity";
import { ApprovalTaskEntity } from "../approval-task/approval-task.entity";

export enum ApprovalFileSignatureStatus {
  Valid = "valid",
  /** Đã quay bản hiện tại về trước lần ký này (chưa có thao tác rollback — để dành) */
  RolledBack = "rolled_back",
}

/**
 * Một lần ký số một văn bản tờ trình bởi một task. Mỗi lần ký tạo một file mới
 * Attachments/{requestId}/round-{n}/signed/{taskId}-{tên}.pdf và không xóa file nào: before là bản trước khi ký,
 * after là bản sau khi ký (đồng thời là bản hiện tại mới của văn bản trong vòng). Đủ dữ liệu để biết ký lỗi từ task nào
 * và quay bản hiện tại về before khi cần ký lại.
 */
@Entity({ tableName: "approval_file_signatures" })
export class ApprovalFileSignatureEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => ApprovalRequestEntity })
  request!: ApprovalRequestEntity;

  @Property({ type: types.integer })
  round!: number;

  /** Văn bản (trong bộ tệp của vòng) được ký */
  @Index()
  @ManyToOne({ cascade: [], entity: () => ApprovalRequestFileEntity })
  requestFile!: ApprovalRequestFileEntity;

  @Index()
  @ManyToOne({ cascade: [], entity: () => ApprovalTaskEntity })
  task!: ApprovalTaskEntity;

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  signer!: UserEntity;

  /** Serial chứng thư dùng để ký (tra trạng thái thu hồi) */
  @Property({ type: types.string })
  certificateSerial!: string;

  /** Bản trước khi ký */
  @ManyToOne({ cascade: [], entity: () => AttachmentEntity })
  before!: AttachmentEntity;

  /** Bản sau khi ký */
  @ManyToOne({ cascade: [], entity: () => AttachmentEntity })
  after!: AttachmentEntity;

  /** Vị trí khung chữ ký thực tế (điểm PDF, gốc dưới-trái) */
  @Property({ type: types.json, nullable: true })
  placement?: { page: number; x: number; y: number; width: number; height: number };

  @Enum({ items: () => ApprovalFileSignatureStatus, default: ApprovalFileSignatureStatus.Valid })
  status: ApprovalFileSignatureStatus = ApprovalFileSignatureStatus.Valid;
}
