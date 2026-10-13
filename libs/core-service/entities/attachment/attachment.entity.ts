import { BaseEntity } from "@common/base/base.entity";
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

  /** URL công khai để truy cập file; rỗng với file private (phải xin link ký qua API) */
  @Property({ type: types.string })
  url!: string;

  /** public: bucket công khai · private: bucket riêng, chỉ tải qua presigned URL sau khi kiểm quyền */
  @Property({ type: types.string, default: AttachmentVisibility.Public })
  visibility: AttachmentVisibility = AttachmentVisibility.Public;

  /** pending: chờ upload thẳng lên R2 và xác nhận · ready: dùng được (mặc định, nên file cũ không đổi) */
  @Property({ type: types.string, default: AttachmentStatus.Ready })
  status: AttachmentStatus = AttachmentStatus.Ready;

  /** Thư mục lưu trữ trên R2 (phải thuộc STORAGE_PATH) */
  @Property({ type: types.string })
  storagePath!: string;
}
