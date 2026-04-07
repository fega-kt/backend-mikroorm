import { BaseEntity } from "@common/base/base.entity";
import { Entity, Property, types } from "@mikro-orm/core";

@Entity({ collection: "attachments" })
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

  /** URL công khai để truy cập file */
  @Property({ type: types.string })
  url!: string;

  /** Thư mục lưu trữ trên R2 (phải thuộc STORAGE_PATH) */
  @Property({ type: types.string })
  storagePath!: string;
}
