import { BaseService } from "@common/base/base.service";
import { EntityManager, EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import {
  type CopyWorkDayOverrideDto,
  type CreateWorkDayOverrideDto,
  type UpdateWorkDayOverrideDto,
  type WorkDayOverrideFilterDto,
} from "../../controllers/work-calendar/work-calendar.validation";
import { WorkDayOverrideEntity, WorkDayType } from "../../entities/work-day-override";
import { WorkShiftEntity } from "../../entities/work-shift";
import { eachDate, isValidDate } from "./work-calendar.util";
import { assertTarget, targetData, targetWhere } from "./work-target";

@Injectable({ scope: Scope.REQUEST })
export class WorkDayOverrideService extends BaseService<WorkDayOverrideEntity> {
  constructor(
    @InjectRepository(WorkDayOverrideEntity)
    protected readonly repo: EntityRepository<WorkDayOverrideEntity>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  getList(filter: WorkDayOverrideFilterDto) {
    const where: FilterQuery<WorkDayOverrideEntity> = { deleted: false, date: { $gte: filter.from, $lte: filter.to } };
    if (filter.targetType) where.targetType = filter.targetType;
    if (filter.departmentId) where.department = filter.departmentId;
    if (filter.userId) where.user = filter.userId;
    return this.repo.find(where, {
      fields: [
        "id",
        "targetType",
        "date",
        "type",
        "name",
        "shift.id",
        "shift.code",
        "shift.name",
        "shift.color",
        "department.id",
        "department.name",
        "user.id",
        "user.fullName",
        "user.avatar",
      ],
      populate: ["shift", "department", "user"],
      orderBy: { date: "ASC", targetType: "ASC" },
      disableIdentityMap: true,
    });
  }

  /** Tạo ngày đặc biệt cho mọi ngày trong [from, to]; ngày đối tượng đã có thì ghi đè */
  async createOverrides(data: CreateWorkDayOverrideDto) {
    await assertTarget(this.em, data);
    const shiftId = await this.resolveShift(data.type, data.shiftId);
    const dates = eachDate(data.from, data.to);

    await this.em.transactional(async (em) => {
      const existing = await em.find(WorkDayOverrideEntity, { ...targetWhere(data), deleted: false, date: { $in: dates } });
      const byDate = new Map(existing.map((o) => [o.date, o]));
      const values = {
        type: data.type,
        name: data.name,
        shift: shiftId ? em.getReference(WorkShiftEntity, shiftId) : null,
      };
      const created = this.getDefaultValuesForCreate();
      const updated = this.getDefaultValuesForUpdate();
      for (const date of dates) {
        const current = byDate.get(date);
        if (current) Object.assign(current, values, updated);
        else em.create(WorkDayOverrideEntity, { ...targetData(em, data), date, ...values, ...created });
      }
      await em.flush();
    });
    return { count: dates.length };
  }

  async updateOverride(id: string, data: UpdateWorkDayOverrideDto) {
    if (!(await this.repo.count({ id, deleted: false }))) throw new NotFoundException("Special day not found");
    const shiftId = await this.resolveShift(data.type, data.shiftId);
    await this.updateOne(id, {
      type: data.type,
      name: data.name,
      shift: shiftId ? this.em.getReference(WorkShiftEntity, shiftId) : null,
    });
    return { id };
  }

  /**
   * Chép ngày đặc biệt của đối tượng sang năm khác, giữ ngày / tháng; bỏ qua ngày đã có, ngày không tồn tại (29/02)
   * và ngày làm có ca đã xóa
   */
  async copyYear(data: CopyWorkDayOverrideDto) {
    await assertTarget(this.em, data);
    const target = targetWhere(data);
    const yearRange = (year: number) => ({ $gte: `${year}-01-01`, $lte: `${year}-12-31` });

    return this.em.transactional(async (em) => {
      const source = await em.find(
        WorkDayOverrideEntity,
        { ...target, deleted: false, date: yearRange(data.fromYear) },
        { populate: ["shift"] },
      );
      const taken = new Set(
        (await em.find(WorkDayOverrideEntity, { ...target, deleted: false, date: yearRange(data.toYear) }, { fields: ["date"] })).map(
          (o) => o.date,
        ),
      );
      const created = this.getDefaultValuesForCreate();
      let copied = 0;
      for (const override of source) {
        const date = `${data.toYear}${override.date.slice(4)}`;
        if (!isValidDate(date) || taken.has(date)) continue;
        if (override.type === WorkDayType.Work && (!override.shift || override.shift.deleted)) continue;
        em.create(WorkDayOverrideEntity, {
          ...targetData(em, data),
          date,
          type: override.type,
          name: override.name,
          shift: override.shift ?? null,
          ...created,
        });
        copied++;
      }
      await em.flush();
      return { copied, skipped: source.length - copied };
    });
  }

  /** Ngày làm cần ca còn dùng được; ngày nghỉ bỏ ca */
  private async resolveShift(type: WorkDayType, shiftId?: string | null) {
    if (type !== WorkDayType.Work) return null;
    if (!(await this.em.count(WorkShiftEntity, { id: shiftId, deleted: false }))) throw new BadRequestException("Work shift not found");
    return shiftId;
  }
}
