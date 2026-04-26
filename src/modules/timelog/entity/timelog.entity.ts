import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, ManyToOne, Property, types } from "@mikro-orm/core";
import { TaskEntity } from "@modules/task/entity/task.entity";
import { UserEntity } from "@modules/user/entity/user.entity";

export enum TimeLogStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

@Entity({ collection: "timelogs" })
export class TimeLogEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => TaskEntity })
  task!: TaskEntity;

  @ManyToOne({ cascade: [], entity: () => UserEntity })
  user!: UserEntity;

  /** Ngày làm việc */
  @Property({ type: Date })
  date!: Date;

  /** Số giờ đã làm (tối đa 24h/ngày) */
  @Property({ type: types.float })
  hours!: number;

  @Property({ type: types.string, nullable: true })
  note?: string;

  @Enum(() => TimeLogStatus)
  status: TimeLogStatus = TimeLogStatus.PENDING;

  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  reviewedBy?: UserEntity;

  @Property({ type: Date, nullable: true })
  reviewedAt?: Date;

  @Property({ type: types.string, nullable: true })
  rejectReason?: string;
}
