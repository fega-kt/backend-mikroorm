import { BaseEntity } from "@common/base/base.entity";
import { DepartmentEntity } from "@core-service/entities/department";
import { Entity, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { RequestTypeEntity } from "../request-type/request-type.entity";
import type { ApprovalWorkflowVersionEntity } from "../approval-workflow-version/approval-workflow-version.entity";

/** Quy trình duyệt áp dụng cho một loại đơn (tùy chọn giới hạn theo phòng ban) */
@Entity({ tableName: "approval_workflows" })
export class ApprovalWorkflowEntity extends BaseEntity {
  @Property({ type: types.string })
  name!: string;

  @Property({ type: types.text, nullable: true })
  description?: string;

  @Index()
  @ManyToOne({ cascade: [], entity: () => RequestTypeEntity })
  requestType!: RequestTypeEntity;

  /** null → áp dụng cho mọi phòng ban; quy trình riêng của phòng ban được ưu tiên khi chọn */
  @ManyToOne({ cascade: [], entity: () => DepartmentEntity, nullable: true })
  department?: DepartmentEntity;

  /** Số lớn hơn được ưu tiên khi nhiều quy trình cùng khớp */
  @Property({ type: types.integer, default: 0 })
  priority: number = 0;

  @Property({ type: types.boolean, default: true })
  isActive: boolean = true;

  /** Phiên bản đang chạy — đơn mới sẽ gắn với phiên bản này */
  @ManyToOne("ApprovalWorkflowVersionEntity", { cascade: [], nullable: true })
  publishedVersion?: ApprovalWorkflowVersionEntity;
}
