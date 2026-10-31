import { BaseEntity } from "@common/base/base.entity";
import { Entity, Index, Property, types } from "@mikro-orm/core";

/** Mốc của lịch tuần: một ngày thứ Hai, để days[0] = thứ Hai … days[6] = Chủ nhật */
export const WEEK_ANCHOR_DATE = "2024-01-01";

/**
 * Lịch làm việc theo chu kỳ: days[i] là ca của ngày thứ i trong chu kỳ (null = nghỉ), tính từ anchorDate.
 * Lịch tuần là chu kỳ 7 ngày neo vào WEEK_ANCHOR_DATE; ca xoay (vd: làm 2 nghỉ 1) dùng chu kỳ khác và mốc riêng.
 */
@Entity({ tableName: "work_schedules" })
export class WorkScheduleEntity extends BaseEntity {
  @Index()
  @Property({ type: types.string })
  code!: string;

  @Property({ type: types.string })
  name!: string;

  @Property({ type: types.integer, default: 7 })
  cycleDays: number = 7;

  /** Ngày ứng với days[0] (YYYY-MM-DD) */
  @Property({ type: types.date })
  anchorDate!: string;

  /** Id ca của từng ngày trong chu kỳ; null = nghỉ */
  @Property({ type: types.json })
  days!: (string | null)[];

  /**
   * Lịch trực (bảo vệ, kỹ thuật 24/7): bỏ qua ngày nghỉ khai báo ở cấp rộng hơn nơi gán lịch
   * (vd: lịch gán cho tổ bảo vệ thì không nghỉ theo ngày lễ của công ty); ngày nghỉ riêng của người vẫn áp dụng
   */
  @Property({ type: types.boolean, default: false })
  ignoreHolidays: boolean = false;

  @Property({ type: types.text, nullable: true })
  description?: string;
}
