import { BaseEntity } from "@common/base/base.entity";
import { Entity, Index, Property, types } from "@mikro-orm/core";

/** Một khung giờ làm trong ca, dạng "HH:mm"; end <= start nghĩa là kết thúc vào ngày hôm sau */
export interface ShiftSegment {
  start: string;
  end: string;
}

/**
 * Ca làm việc: một hoặc nhiều khung giờ liên tiếp (vd: sáng 08:00–12:00, chiều 13:30–17:30).
 * Ca qua đêm thuộc về ngày bắt đầu ca. Mã duy nhất trong các ca chưa xóa (kiểm tra ở service).
 */
@Entity({ tableName: "work_shifts" })
export class WorkShiftEntity extends BaseEntity {
  @Index()
  @Property({ type: types.string })
  code!: string;

  @Property({ type: types.string })
  name!: string;

  /** Màu hiển thị trên lịch (#rrggbb) */
  @Property({ type: types.string, length: 20, nullable: true })
  color?: string;

  @Property({ type: types.json })
  segments!: ShiftSegment[];

  /** Tổng số phút làm của các khung giờ (tự tính khi lưu) */
  @Property({ type: types.integer })
  workMinutes!: number;

  @Property({ type: types.text, nullable: true })
  description?: string;
}
