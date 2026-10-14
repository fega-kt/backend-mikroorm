import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import type { AttachmentConfig } from "../../services/approval-engine/attachment-config";
import { CategoryEntity } from "../category/category.entity";
import { FormEntity } from "../form/form.entity";

export enum RequestTypeStatus {
  Draft = "draft",
  Published = "published",
  Cancelled = "cancelled",
}

@Entity({ tableName: "request_types" })
export class RequestTypeEntity extends BaseEntity {
  @Property({ unique: true, type: types.string })
  code!: string;

  @Property({ type: types.string })
  name!: string;

  @Index()
  @ManyToOne({ cascade: [], entity: () => CategoryEntity })
  category!: CategoryEntity;

  @Property({ type: types.string })
  prefix!: string;

  @Property({ type: types.text, nullable: true })
  description?: string;

  /** Form (danh sách trường) mà loại này dùng — nhiều loại có thể dùng chung một form. FE sinh ô nhập, BE validate payload khi gửi */
  @Index()
  @ManyToOne({ cascade: [], entity: () => FormEntity })
  form!: FormEntity;

  /** Cấu hình 2 khối tệp (Văn bản tờ trình, Tài liệu đính kèm) — null → mặc định */
  @Property({ type: types.json, nullable: true })
  attachmentConfig?: AttachmentConfig;

  @Enum({ items: () => RequestTypeStatus, default: RequestTypeStatus.Draft })
  status: RequestTypeStatus = RequestTypeStatus.Draft;
}
