import { BaseEntity } from "@common/base/base.entity";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { DepartmentEntity } from "@core-service/entities/department";
import { UserEntity } from "@core-service/entities/user";
import { Collection, Entity, Enum, Index, ManyToMany, ManyToOne, Property, types } from "@mikro-orm/core";
import { ApprovalWorkflowVersionEntity } from "../approval-workflow-version/approval-workflow-version.entity";
import { RequestTypeEntity } from "../request-type/request-type.entity";
import { RequestTypeVersionEntity } from "../request-type-version/request-type-version.entity";
import { FormVersionEntity } from "../form-version/form-version.entity";

export enum ApprovalRequestStatus {
  Draft = "draft",
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Returned = "returned",
  Cancelled = "cancelled",
}

/** Độ ưu tiên — số để sắp xếp được (lớn hơn = gấp hơn) */
export enum ApprovalPriority {
  Low = 0,
  Normal = 1,
  High = 2,
  Urgent = 3,
}

/** Tờ trình đề nghị phê duyệt */
@Entity({ tableName: "approval_requests" })
@Index({ properties: ["requester", "status"] })
export class ApprovalRequestEntity extends BaseEntity {
  /** Mã đơn, sinh khi gửi lần đầu: <prefix>-<năm>-<4 số>, ví dụ NP-2026-0001 */
  @Property({ type: types.string, unique: true, nullable: true })
  code?: string;

  @Property({ type: types.string })
  title!: string;

  @Index()
  @ManyToOne({ cascade: [], entity: () => RequestTypeEntity })
  requestType!: RequestTypeEntity;

  /**
   * Phiên bản cấu hình của loại tờ trình (tên, tiền tố, cấu hình tệp…) gắn cứng lúc tạo phiếu: loại bị sửa hay xóa sau đó
   * không ảnh hưởng phiếu đã tạo — phiếu vẫn hiển thị, gửi và chạy bình thường; chỉ phiếu mới mới không chọn được loại đã xóa.
   */
  @ManyToOne({ cascade: [], entity: () => RequestTypeVersionEntity })
  requestTypeVersion!: RequestTypeVersionEntity;

  /** Phiên bản form gắn cứng lúc tạo phiếu; sửa form trong cài đặt không ảnh hưởng phiếu đã tạo */
  @ManyToOne({ cascade: [], entity: () => FormVersionEntity })
  formVersion!: FormVersionEntity;

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  requester!: UserEntity;

  /** Đơn vị trình (phòng của người tạo hoặc phòng cấp trên) — dùng để chọn quy trình và tìm trưởng/phó phòng */
  @ManyToOne({ cascade: [], entity: () => DepartmentEntity })
  department!: DepartmentEntity;

  /** Gắn cứng khi gửi; admin sửa quy trình không ảnh hưởng đơn đang chạy */
  @ManyToOne({ cascade: [], entity: () => ApprovalWorkflowVersionEntity, nullable: true })
  workflowVersion?: ApprovalWorkflowVersionEntity;

  @Property({ type: types.json })
  payload: Record<string, unknown> = {};

  @Enum({ items: () => ApprovalRequestStatus, default: ApprovalRequestStatus.Draft })
  status: ApprovalRequestStatus = ApprovalRequestStatus.Draft;

  @Index()
  @Enum({ items: () => ApprovalPriority, default: ApprovalPriority.Normal })
  priority: ApprovalPriority = ApprovalPriority.Normal;

  /** Node đang chờ duyệt (mảng để mở rộng sau; hiện tại tối đa 1 phần tử) */
  @Property({ type: types.array, columnType: "text[]", default: "{}" })
  currentNodeIds: string[] = [];

  /** Node đã đi qua trong lượt hiện tại (cả condition/notify) — tô màu sơ đồ tiến trình */
  @Property({ type: types.array, columnType: "text[]", default: "{}" })
  visitedNodeIds: string[] = [];

  /** Số lần gửi — tăng mỗi lần gửi lại sau khi bị trả lại; task gắn theo lượt */
  @Property({ type: types.integer, default: 0 })
  round: number = 0;

  /** Văn bản tờ trình (file chính) */
  @ManyToMany({ cascade: [], entity: () => AttachmentEntity, pivotTable: "approval_requests_documents" })
  documents = new Collection<AttachmentEntity>(this);

  /** Tài liệu đính kèm bổ sung */
  @ManyToMany({ cascade: [], entity: () => AttachmentEntity })
  attachments = new Collection<AttachmentEntity>(this);

  @Property({ type: types.datetime, nullable: true })
  submittedAt?: Date;

  @Property({ type: types.datetime, nullable: true })
  closedAt?: Date;

  /** Optimistic lock dự phòng bên cạnh khóa dòng PESSIMISTIC_WRITE */
  @Property({ version: true })
  version!: number;
}
