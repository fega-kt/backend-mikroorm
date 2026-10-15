/**
 * Event phê duyệt: ghi vào outbox cùng transaction, đẩy lên exchange "approval" sau commit; routing key = approval.<type>.
 * Nghiệp vụ khác (trừ ngày phép...) chỉ cần thêm consumer cho approval.request.approved — nhớ bỏ qua event trùng theo `eventId`.
 */
export enum ApprovalEventType {
  Submitted = "request.submitted",
  StepPending = "request.step_pending",
  Approved = "request.approved",
  Rejected = "request.rejected",
  Returned = "request.returned",
  Cancelled = "request.cancelled",
  Reminder = "request.reminder",
  Escalated = "request.escalated",
  Notify = "request.notify",
  /** Một bước duyệt xong (theo cấu hình thông báo của bước) */
  StepApproved = "request.step_approved",
  /** Tờ trình được chia sẻ cho người / nhóm */
  Shared = "request.shared",
}

export interface ApprovalEventMessage {
  type: ApprovalEventType;
  requestId: string;
  code?: string;
  title: string;
  requestTypeName?: string;
  requesterId: string;
  /** Người nhận email (đã loại người thao tác) */
  recipientIds: string[];
  actorId?: string;
  nodeName?: string;
  comment?: string;
  /** Nội dung tùy chỉnh của node notify */
  message?: string;
  /** Mẫu email của node notify (bỏ trống → mẫu mặc định) */
  templateCode?: string;
  occurredAt: string;
  /** Id dòng outbox — duy nhất cho mỗi event, consumer dùng để bỏ qua event nhận trùng */
  eventId?: string;
}
