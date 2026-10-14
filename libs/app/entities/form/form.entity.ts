import { BaseEntity } from "@common/base/base.entity";
import { Entity, Property, types } from "@mikro-orm/core";
import type { FormSchema } from "../../services/approval-engine/form-schema";

/**
 * Form (danh sách trường nhập liệu) dùng chung cho nhiều loại tờ trình.
 * `formSchema` là bản hiện hành — admin sửa ở đây; mỗi lần đổi thật sự sẽ sinh một FormVersionEntity,
 * và phiếu gắn cứng phiên bản lúc tạo nên chỉ phiếu tạo sau mới dùng form mới.
 */
@Entity({ tableName: "forms" })
export class FormEntity extends BaseEntity {
  @Property({ unique: true, type: types.string })
  code!: string;

  @Property({ type: types.string })
  name!: string;

  @Property({ type: types.text, nullable: true })
  description?: string;

  @Property({ type: types.json, nullable: true })
  formSchema?: FormSchema;
}
