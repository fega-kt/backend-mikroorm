import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";
import { DepartmentEntity } from "../department/department.entity";
import { UserEntity } from "../user/user.entity";
import { WorkScheduleEntity } from "../work-schedule/work-schedule.entity";

/** Đối tượng nhận lịch / ngày đặc biệt; lấy ca theo thứ tự người → phòng → phòng cha … → công ty */
export enum WorkTargetType {
  Company = "company",
  Department = "department",
  User = "user",
}

/**
 * Gán lịch làm việc cho công ty / phòng ban / người trong một khoảng hiệu lực.
 * Các khoảng của cùng một đối tượng không chồng nhau (gán lịch mới thì lịch đang hiệu lực tự kết thúc trước đó một ngày).
 */
@Entity({ tableName: "work_schedule_assignments" })
@Index({ properties: ["targetType", "effectiveFrom"] })
export class WorkScheduleAssignmentEntity extends BaseEntity {
  @Enum({ items: () => WorkTargetType })
  targetType!: WorkTargetType;

  /** Có khi targetType = department */
  @Index()
  @ManyToOne({ cascade: [], entity: () => DepartmentEntity, nullable: true })
  department?: DepartmentEntity;

  /** Có khi targetType = user */
  @Index()
  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  user?: UserEntity;

  @ManyToOne({ cascade: [], entity: () => WorkScheduleEntity })
  schedule!: WorkScheduleEntity;

  /** Ngày bắt đầu hiệu lực (YYYY-MM-DD) */
  @Property({ type: types.date })
  effectiveFrom!: string;

  /** Ngày cuối hiệu lực, tính cả ngày này; trống = không thời hạn */
  @Property({ type: types.date, nullable: true })
  effectiveTo?: string | null;
}
