import { BaseEntity } from "@common/base/base.entity";
import { Entity, Index, ManyToOne, Property, types, Unique } from "@mikro-orm/core";
import type { FormSchema } from "../../services/approval-engine/form-schema";
import { FormEntity } from "../form/form.entity";

/** Một phiên bản của form. Bản đã sinh ra không bao giờ bị sửa — mỗi phiếu trỏ tới đúng phiên bản lúc tạo */
@Entity({ tableName: "form_versions" })
@Unique({ properties: ["form", "version"] })
export class FormVersionEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => FormEntity })
  form!: FormEntity;

  @Property({ type: types.integer })
  version!: number;

  @Property({ type: types.json, nullable: true })
  formSchema?: FormSchema;
}
