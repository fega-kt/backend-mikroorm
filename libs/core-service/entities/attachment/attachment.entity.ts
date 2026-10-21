import { BaseEntity } from "@common/base/base.entity";
import { toPublicUrl } from "@common/base/public-url.type";
import { Entity, Property, types } from "@mikro-orm/core";

export enum AttachmentVisibility {
  Public = "public",
  Private = "private",
}

export enum AttachmentStatus {
  /** Đã xin link upload nhưng chưa xác nhận: chưa được gắn vào tờ trình */
  Pending = "pending",
  Ready = "ready",
}

/**
 * Bản xem tối ưu của PDF (lưu riêng ở folder Previews, file gốc giữ nguyên):
 * - none: không áp dụng (tệp không phải PDF / tệp public)
 * - pending: chờ job xử lý (tệp mới, PDF cũ chạy bù, hoặc chờ thử lại sau lỗi)
 * - ready: có bản xem (previewKey) · skipped: không cần / không được tạo (mã hóa, ký số, bố cục đã gọn)
 * - failed: lỗi đủ số lần thử, trình xem dùng tệp gốc
 */
export enum AttachmentPreviewStatus {
  None = "none",
  Pending = "pending",
  Ready = "ready",
  Skipped = "skipped",
  Failed = "failed",
}

@Entity({ tableName: "attachments" })
export class AttachmentEntity extends BaseEntity {
  /** Tên file gốc khi upload */
  @Property({ type: types.string })
  filename!: string;

  /** MIME type của file (vd: image/png, application/pdf) */
  @Property({ type: types.string })
  mimetype!: string;

  /** Dung lượng file tính bằng bytes */
  @Property({ type: types.integer })
  size!: number;

  /** Key lưu trên R2 storage (dùng để xóa hoặc tạo URL) */
  @Property({ type: types.string })
  key!: string;

  /** public: bucket công khai · private: bucket riêng, chỉ tải qua presigned URL sau khi kiểm quyền */
  @Property({ type: types.string, default: AttachmentVisibility.Public })
  visibility: AttachmentVisibility = AttachmentVisibility.Public;

  /**
   * URL công khai để truy cập file: ghép R2_PUBLIC_URL với key, không lưu DB (vẫn có trong JSON trả về).
   * Rỗng với file private (phải xin link ký qua API). Lấy ít cột (fields) thì phải kèm key và visibility.
   */
  @Property({ persist: false })
  get url(): string {
    return this.visibility === AttachmentVisibility.Private || !this.key ? "" : toPublicUrl(this.key);
  }

  /** pending: chờ upload thẳng lên R2 và xác nhận · ready: dùng được (mặc định, nên file cũ không đổi) */
  @Property({ type: types.string, default: AttachmentStatus.Ready })
  status: AttachmentStatus = AttachmentStatus.Ready;

  /** Ngữ cảnh chủ sở hữu của tệp (FileContextType) — quyết định quy tắc phân quyền khi xem; rỗng với tệp chưa gắn ngữ cảnh */
  @Property({ type: types.string, nullable: true })
  contextType?: string | null;

  /** Id bản ghi chủ trong ngữ cảnh đó (vd: id phiếu — có thể là id đang giữ chỗ khi phiếu chưa lưu) */
  @Property({ type: types.string, nullable: true })
  refId?: string | null;

  /** Thư mục lưu trữ trên R2 (phải thuộc STORAGE_PATH) */
  @Property({ type: types.string })
  storagePath!: string;

  /** Key bản xem trên R2 (folder Previews): PDF được sắp xếp lại để trình xem chỉ tải trang đang xem */
  @Property({ type: types.string, nullable: true })
  previewKey?: string | null;

  /** Trạng thái tạo bản xem (AttachmentPreviewStatus) */
  @Property({ type: types.string, default: AttachmentPreviewStatus.None })
  previewStatus: AttachmentPreviewStatus = AttachmentPreviewStatus.None;

  /** Số lần tạo bản xem bị lỗi: dưới mức tối đa thì quay về pending để thử lại (giãn dần), đủ thì failed */
  @Property({ type: types.integer, default: 0 })
  previewAttempts: number = 0;
}
