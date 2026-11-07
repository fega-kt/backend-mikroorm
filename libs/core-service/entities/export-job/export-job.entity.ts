import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { UserEntity } from "../user/user.entity";

export enum ExportJobStatus {
  /** Chờ worker nhận */
  Queued = "queued",
  Processing = "processing",
  Done = "done",
  Failed = "failed",
  /** Người dùng hủy (khi đang chờ hoặc đang chạy) */
  Cancelled = "cancelled",
  /** File đã bị xóa khỏi kho sau thời hạn lưu */
  Expired = "expired",
}

export enum ExportEmailStatus {
  /** Người dùng không chọn gửi email */
  None = "none",
  /** Chưa gửi (job chưa xong) */
  Pending = "pending",
  /** Đã gửi (có thể không đính kèm file nếu quá lớn) */
  Sent = "sent",
  /** Không gửi được: không có địa chỉ email hoặc dịch vụ gửi lỗi — chi tiết ở `emailError` */
  Failed = "failed",
}

/**
 * Một lượt xuất Excel chạy nền (dữ liệu lớn). Chính bảng này là hàng đợi: worker nhận dòng `queued` (khóa `SKIP LOCKED`),
 * cập nhật `heartbeatAt` khi chạy, và bản ghi giữ lại làm lịch sử xuất. File nằm ở bucket private tại `fileKey`.
 * Người yêu cầu là `user` (cũng là `createdBy`).
 */
@Entity({ tableName: "export_jobs" })
@Index({ properties: ["user", "createdAt"] })
@Index({ properties: ["status", "createdAt"] })
export class ExportJobEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => UserEntity })
  user!: UserEntity;

  /** Khóa tài nguyên (vd: approval-request-mine) — worker tra định nghĩa xuất theo khóa này */
  @Property({ type: types.string })
  resource!: string;

  /** Bộ lọc gốc như client gửi (định nghĩa xuất tự parse khi chạy) */
  @Property({ type: types.json })
  filter: unknown = {};

  /** Phạm vi quyền đã chốt lúc yêu cầu (vd: xem toàn hệ thống hay một phòng ban) — worker không có quyền của người dùng */
  @Property({ type: types.json, nullable: true })
  scope?: unknown;

  /** Cột đã chọn (khóa + nhãn); null = mọi cột */
  @Property({ type: types.json, nullable: true })
  columns?: { key: string; header?: string }[];

  @Property({ type: types.string })
  lang!: string;

  /** Chỉ lấy dòng tạo trước thời điểm này */
  @Property({ type: types.datetime })
  cutoff!: Date;

  /** Tên file người dùng thấy khi tải (.xlsx, hoặc .zip khi nhiều phần) */
  @Property({ type: types.string })
  filename!: string;

  @Enum({ items: () => ExportJobStatus, default: ExportJobStatus.Queued })
  status: ExportJobStatus = ExportJobStatus.Queued;

  /** Số dòng dự kiến lúc yêu cầu */
  @Property({ type: types.integer })
  total!: number;

  /** Số dòng đã ghi — để hiện tiến độ */
  @Property({ type: types.integer, default: 0 })
  processed: number = 0;

  /** Số file xlsx trong kết quả (> 1 thì kết quả là zip) */
  @Property({ type: types.integer, default: 1 })
  parts: number = 1;

  /** Khóa object trên bucket private; có khi status = done */
  @Property({ type: types.string, nullable: true })
  fileKey?: string;

  /** Kích thước file (byte) */
  @Property({ type: types.bigint, nullable: true })
  size?: string;

  /** Lý do lỗi, ngắn gọn (không chứa chi tiết nội bộ) */
  @Property({ type: types.text, nullable: true })
  error?: string;

  /** Người dùng yêu cầu hủy; worker kiểm tra giữa các lô */
  @Property({ type: types.boolean, default: false })
  cancelRequested: boolean = false;

  @Property({ type: types.boolean, default: false })
  sendEmail: boolean = false;

  @Enum({ items: () => ExportEmailStatus, default: ExportEmailStatus.None })
  emailStatus: ExportEmailStatus = ExportEmailStatus.None;

  @Property({ type: types.text, nullable: true })
  emailError?: string;

  @Property({ type: types.datetime, nullable: true })
  startedAt?: Date;

  @Property({ type: types.datetime, nullable: true })
  finishedAt?: Date;

  /** Lần cuối worker báo còn sống; quá hạn thì job coi như treo */
  @Property({ type: types.datetime, nullable: true })
  heartbeatAt?: Date;

  /** Sau thời điểm này file bị xóa và job chuyển sang expired */
  @Property({ type: types.datetime, nullable: true })
  expiresAt?: Date;
}
