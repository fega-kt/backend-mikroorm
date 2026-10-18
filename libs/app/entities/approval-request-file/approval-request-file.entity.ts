import { BaseEntity } from "@common/base/base.entity";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { Entity, Enum, Index, ManyToOne, Property, types, Unique } from "@mikro-orm/core";
import { RequestFileCategory } from "../../services/approval-request/request-file.constants";
import { ApprovalRequestEntity } from "../approval-request/approval-request.entity";

/** Chuyển văn bản Word / Excel / PowerPoint sang PDF trước khi ký (làm sẵn ở nền khi tờ trình tới bước ký) */
export enum RequestFileConvertStatus {
  /** Chờ job chuyển (lần đầu, hoặc thử lại sau lỗi tới convertNextAt) */
  Pending = "pending",
  Done = "done",
  /** Hết lượt thử ở nền — người duyệt mở hộp ký sẽ chuyển lại */
  Failed = "failed",
}

/**
 * Tệp của tờ trình theo vòng duyệt — nơi duy nhất lưu tệp của tờ trình.
 * - round <= request.round: bộ tệp đã đưa đi duyệt ở vòng đó (không sửa nữa, trừ bản hiện tại khi ký);
 * - round = request.round + 1: bộ tệp người trình đang soạn (bản nháp / bị trả lại), gửi đi thì thành vòng mới.
 *
 * original là tệp người trình tải lên (không bao giờ bị sửa). current là bản hiện tại: ban đầu chính là original;
 * văn bản ký số thì là bản PDF chuyển đổi / bản ký mới nhất (Attachments/{requestId}/round-{n}/signed).
 */
@Entity({ tableName: "approval_request_files" })
@Unique({ properties: ["request", "round", "category", "original"] })
@Index({ properties: ["request", "round"] })
export class ApprovalRequestFileEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => ApprovalRequestEntity })
  request!: ApprovalRequestEntity;

  /** Vòng duyệt; vòng đang soạn = request.round + 1 */
  @Property({ type: types.integer })
  round!: number;

  /** Văn bản tờ trình / tài liệu đính kèm */
  @Enum({ items: () => RequestFileCategory })
  category!: RequestFileCategory;

  /** Thứ tự trong danh sách */
  @Property({ type: types.integer, default: 0 })
  position: number = 0;

  /** Tệp người trình tải lên */
  @ManyToOne({ cascade: [], entity: () => AttachmentEntity })
  original!: AttachmentEntity;

  /** Bản hiện tại (bằng original, hoặc bản PDF chuyển đổi / bản ký mới nhất) */
  @ManyToOne({ cascade: [], entity: () => AttachmentEntity })
  current!: AttachmentEntity;

  /** Số chữ ký số đã ký lên tệp trong vòng */
  @Property({ type: types.integer, default: 0 })
  signatureCount: number = 0;

  /** Chuyển sang PDF ở nền; null = không cần (không phải văn bản ký / chưa tới bước ký) */
  @Enum({ items: () => RequestFileConvertStatus, nullable: true })
  convertStatus?: RequestFileConvertStatus;

  @Property({ type: types.integer, default: 0 })
  convertAttempts: number = 0;

  /** Lần thử tiếp theo của job (pending) */
  @Index()
  @Property({ type: types.datetime, nullable: true })
  convertNextAt?: Date;

  @Property({ type: types.text, nullable: true })
  convertError?: string;
}
