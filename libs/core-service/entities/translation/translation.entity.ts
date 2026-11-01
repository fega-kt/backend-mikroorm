import { BaseEntity } from "@common/base/base.entity";
import { Entity, Property, types } from "@mikro-orm/core";

/**
 * Bản dịch của một chuỗi, mỗi dòng giữ cả ba ngôn ngữ nên nhập một lần là xong tất cả;
 * ngôn ngữ để trống (chuỗi rỗng) = không có bản dịch, frontend dùng chuỗi mặc định.
 * `key` gồm namespace làm tiền tố (vd: `form.<formId>.field.reason.label`) — namespace chỉ là quy ước đặt khóa,
 * khi đọc theo namespace sẽ lọc theo tiền tố rồi bỏ tiền tố đi.
 *
 * - `form.<formId>`: chuỗi gốc (tiếng Việt) nằm ở formSchema; cột `vi` mặc định là bản chép của chuỗi gốc (tự cập nhật theo form),
 *   sửa tay thì đè lên chuỗi gốc khi hiển thị tiếng Việt; để trống = dùng chuỗi gốc.
 * - `app`: key trùng key i18n của frontend; bản dịch ở đây được ưu tiên, file JSON của frontend chỉ là mặc định.
 * Xóa bản dịch = xóa mềm (`deleted = true`); thêm lại cùng key thì dùng lại dòng cũ và bật lại (ràng buộc duy nhất của `key` không chặn).
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
