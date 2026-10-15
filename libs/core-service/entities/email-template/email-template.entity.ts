import { BaseEntity } from "@common/base/base.entity";
import { Entity, Property, types } from "@mikro-orm/core";

/**
 * Mẫu email. Mã trùng mẫu hệ thống (approval.*) = bản ghi đè nội dung mặc định; mã khác = mẫu tùy chỉnh
 * (bước Thông báo chọn được).
 */
@Entity({ tableName: "email_templates" })
export class EmailTemplateEntity extends BaseEntity {
  @Property({ type: types.string, unique: true })
  code!: string;

  @Property({ type: types.string })
  name!: string;

  @Property({ type: types.string })
  subject!: string;

  /** Toàn bộ email (HTML: header, thẻ, footer), chứa biến {{...}}; khi gửi chỉ bọc thêm nền xám */
  @Property({ type: types.text })
  body!: string;

  @Property({ type: types.text, nullable: true })
  description?: string;
}
