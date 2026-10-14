import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, ManyToOne, Property, types, Unique } from "@mikro-orm/core";
import type { AttachmentConfig } from "../../services/approval-engine/attachment-config";
import { CategoryEntity } from "../category/category.entity";
import { FormEntity } from "../form/form.entity";
import { RequestTypeEntity, RequestTypeStatus } from "../request-type/request-type.entity";

/**
 * Một phiên bản cấu hình của loại tờ trình (tên, tiền tố, danh mục, biểu mẫu, cấu hình tệp…).
 * Sửa loại chỉ sinh phiên bản mới; bản cũ không bao giờ bị sửa. Phiếu gắn cứng phiên bản lúc tạo nên loại bị sửa hay xóa
 * sau đó không ảnh hưởng phiếu đã tạo — chỉ phiếu mới mới không chọn được loại đã xóa.
 * Trạng thái xuất bản cũng được ghi theo phiên bản (để xem lại lịch sử); việc loại còn cho TẠO phiếu mới hay không
 * vẫn do trạng thái hiện hành của loại quyết định — cũng chính là trạng thái của phiên bản mới nhất.
 */
@Entity({ tableName: "request_type_versions" })
@Unique({ properties: ["requestType", "version"] })
export class RequestTypeVersionEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => RequestTypeEntity })
  requestType!: RequestTypeEntity;

  @Property({ type: types.integer })
  version!: number;

  @Property({ type: types.string })
  code!: string;

  @Property({ type: types.string })
  name!: string;

  /** Tiền tố sinh mã phiếu khi gửi lần đầu */
  @Property({ type: types.string })
  prefix!: string;

  @Property({ type: types.text, nullable: true })
  description?: string;

  @ManyToOne({ cascade: [], entity: () => CategoryEntity })
  category!: CategoryEntity;

  /** Biểu mẫu loại dùng ở phiên bản này; phiếu còn gắn thêm phiên bản của chính biểu mẫu đó (formVersion) */
  @ManyToOne({ cascade: [], entity: () => FormEntity })
  form!: FormEntity;

  @Enum({ items: () => RequestTypeStatus })
  status!: RequestTypeStatus;

  @Property({ type: types.json, nullable: true })
  attachmentConfig?: AttachmentConfig;
}
