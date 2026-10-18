import { BaseEntity } from "@common/base/base.entity";
import { UserEntity } from "@core-service/entities/user";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { ApprovalRequestEntity } from "../approval-request/approval-request.entity";

export enum ApprovalHistoryAction {
  Submit = "submit",
  Resubmit = "resubmit",
  Approve = "approve",
  Reject = "reject",
  Return = "return",
  Cancel = "cancel",
  Skip = "skip",
  AutoApprove = "auto_approve",
  /** Hệ thống từ chối do quá hạn xử lý (bước chọn "Tự động từ chối") */
  AutoReject = "auto_reject",
  Delegate = "delegate",
  Escalate = "escalate",
  Remind = "remind",
  Notify = "notify",
  Complete = "complete",
  /** Tạo phiếu */
  Create = "create",
  /** Sửa thông tin phiếu — data.changes: { field, from, to }[] (field là khóa kỹ thuật, FE tra nhãn theo formSchema) */
  Update = "update",
  /** Thêm tệp — data.files: { id, filename, block }[] */
  FileAdd = "file_add",
  /** Gỡ tệp — data.files: { id, filename, block }[] */
  FileRemove = "file_remove",
  /** Chuyển văn bản sang PDF để ký — data.files: { from: { id, filename }, to: { id, filename } }[] */
  FileConvert = "file_convert",
  /** Ký số văn bản (ngay trước dòng duyệt) — data.files: { from, to }[] (bản trước / bản đã ký), data.certificateSerial */
  Sign = "sign",
  /** Chia sẻ tờ trình (chỉ xem) — data.principals: { id, name }[]; comment: lời nhắn */
  Share = "share",
  /** Thu hồi chia sẻ — data.principals: { id, name }[] */
  Unshare = "unshare",
}

/** Nhật ký thao tác của đơn — nguồn dữ liệu cho timeline ở màn chi tiết đơn (append-only) */
@Entity({ tableName: "approval_histories" })
export class ApprovalHistoryEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => ApprovalRequestEntity })
  request!: ApprovalRequestEntity;

  @Enum({ items: () => ApprovalHistoryAction })
  action!: ApprovalHistoryAction;

  /** null → hệ thống (cron SLA, bỏ qua tự động) */
  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  actor?: UserEntity;

  @Property({ type: types.string, nullable: true })
  nodeId?: string;

  @Property({ type: types.string, nullable: true })
  nodeName?: string;

  @Property({ type: types.text, nullable: true })
  comment?: string;

  @Property({ type: types.json, nullable: true })
  data?: Record<string, unknown>;
}
