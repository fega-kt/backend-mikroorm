import { BaseEntity } from "@common/base/base.entity";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { DepartmentEntity } from "@core-service/entities/department";
import { UserEntity } from "@core-service/entities/user";
import { Collection, Entity, Enum, Index, ManyToMany, ManyToOne, Property, types } from "@mikro-orm/core";
import { ApprovalWorkflowVersionEntity } from "../approval-workflow-version/approval-workflow-version.entity";
import { RequestTypeEntity } from "../request-type/request-type.entity";

export enum ApprovalRequestStatus {
  Draft = "draft",
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Returned = "returned",
  Cancelled = "cancelled",
}

/** Đơn đề nghị phê duyệt */
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

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  requester!: UserEntity;

  /** Phòng ban của người tạo tại thời điểm gửi — dùng để chọn quy trình và tìm trưởng/phó phòng */
  @ManyToOne({ cascade: [], entity: () => DepartmentEntity })
  department!: DepartmentEntity;

  /** Gắn cứng khi gửi; admin sửa quy trình không ảnh hưởng đơn đang chạy */
  @ManyToOne({ cascade: [], entity: () => ApprovalWorkflowVersionEntity, nullable: true })
  workflowVersion?: ApprovalWorkflowVersionEntity;

  @Property({ type: types.json })
  payload: Record<string, unknown> = {};

  @Enum({ items: () => ApprovalRequestStatus, default: ApprovalRequestStatus.Draft })
  status: ApprovalRequestStatus = ApprovalRequestStatus.Draft;

  /** Node đang chờ duyệt (mảng để mở rộng sau; hiện tại tối đa 1 phần tử) */
  @Property({ type: types.array, columnType: "text[]", default: "{}" })
  currentNodeIds: string[] = [];

  /** Node đã đi qua trong lượt hiện tại (cả condition/notify) — tô màu sơ đồ tiến trình */
  @Property({ type: types.array, columnType: "text[]", default: "{}" })
  visitedNodeIds: string[] = [];

  /** Số lần gửi — tăng mỗi lần gửi lại sau khi bị trả lại; task gắn theo lượt */
  @Property({ type: types.integer, default: 0 })
  round: number = 0;

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
