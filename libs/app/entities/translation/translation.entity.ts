import { BaseEntity } from "@common/base/base.entity";
import { Entity, Property, types } from "@mikro-orm/core";

/**
 * Bản dịch của một chuỗi, mỗi dòng giữ đủ ba ngôn ngữ (bắt buộc) nên nhập một lần là xong tất cả.
 * `key` gồm namespace làm tiền tố (vd: `form.<formId>.field.reason.label`) — namespace chỉ là quy ước đặt khóa,
 * khi đọc theo namespace sẽ lọc theo tiền tố rồi bỏ tiền tố đi.
 *
 * Chuỗi gốc (tiếng Việt) vẫn nằm ở nơi sở hữu nó (vd: formSchema); cột `vi` là bản chép để bảng tự đủ nghĩa khi xem.
 * Xóa bản dịch = xóa hẳn dòng (không xóa mềm) để ràng buộc duy nhất của `key` không chặn việc thêm lại.
 */
@Entity({ tableName: "translations" })
export class TranslationEntity extends BaseEntity {
  @Property({ type: types.string, length: 300, unique: true })
  key!: string;

  @Property({ type: types.text })
  vi!: string;

  @Property({ type: types.text })
  en!: string;

  @Property({ type: types.text })
  zh!: string;
}
