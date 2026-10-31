import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { DepartmentEntity } from "../department/department.entity";
import { UserEntity } from "../user/user.entity";
import { WorkTargetType } from "../work-schedule-assignment/work-schedule-assignment.entity";
import { WorkShiftEntity } from "../work-shift/work-shift.entity";

export enum WorkDayType {
  /** Nghỉ (lễ, Tết, nghỉ riêng của phòng / người) */
  Off = "off",
  /** Đi làm với ca chỉ định (làm bù, đổi ca, làm ngày lễ) */
  Work = "work",
}

/**
 * Ngày đặc biệt của công ty / phòng ban / người, thắng lịch làm việc; mỗi đối tượng tối đa một bản ghi mỗi ngày.
 * Nhiều cấp cùng có thì lấy cấp gần người nhất.
 */
@Entity({ tableName: "work_day_overrides" })
@Index({ properties: ["targetType", "date"] })
export class WorkDayOverrideEntity extends BaseEntity {
  @Enum({ items: () => WorkTargetType })
  targetType!: WorkTargetType;

  @Index()
  @ManyToOne({ cascade: [], entity: () => DepartmentEntity, nullable: true })
  department?: DepartmentEntity;

  @Index()
  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  user?: UserEntity;

  /** YYYY-MM-DD */
  @Index()
  @Property({ type: types.date })
  date!: string;

  @Enum({ items: () => WorkDayType })
  type!: WorkDayType;

  /** Ca làm, bắt buộc khi type = work */
  @ManyToOne({ cascade: [], entity: () => WorkShiftEntity, nullable: true })
  shift?: WorkShiftEntity | null;

  /** Tên ngày, vd: "Tết Nguyên đán", "Làm bù thứ Bảy" */
  @Property({ type: types.string })
  name!: string;
}
