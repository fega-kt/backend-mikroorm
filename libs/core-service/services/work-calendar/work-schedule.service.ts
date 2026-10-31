import { BaseService } from "@common/base/base.service";
import { LIST_CACHE_TTL } from "@common/constants/list-cache.constant";
import { todayVn } from "@common/utils/vn-date.util";
import { EntityManager, EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { type WorkScheduleDto } from "../../controllers/work-calendar/work-calendar.validation";
import { WEEK_ANCHOR_DATE, WorkScheduleEntity } from "../../entities/work-schedule";
import { WorkScheduleAssignmentEntity } from "../../entities/work-schedule-assignment";
import { WorkShiftEntity } from "../../entities/work-shift";
import { alignCycleToMonday } from "./work-calendar.util";

@Injectable({ scope: Scope.REQUEST })
export class WorkScheduleService extends BaseService<WorkScheduleEntity> {
  protected readonly listCache = { ttl: LIST_CACHE_TTL.STATIC };

  constructor(
    @InjectRepository(WorkScheduleEntity)
    protected readonly repo: EntityRepository<WorkScheduleEntity>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  getList() {
    return this.cachedList("all", {}, () =>
      this.repo.find(
        { deleted: false },
        {
          fields: ["id", "code", "name", "cycleDays", "anchorDate", "days", "ignoreHolidays", "description", "updatedAt"],
          orderBy: { code: "ASC" },
        },
      ),
    );
  }

  async createSchedule(data: WorkScheduleDto) {
    await this.assertUniqueCode(data.code);
    await this.assertShifts(data.days);
    const schedule = await this.addOne(this.toEntityData(data));
    return { id: schedule.id };
  }

  async updateSchedule(id: string, data: WorkScheduleDto) {
    await this.getActive(id);
    await this.assertUniqueCode(data.code, id);
    await this.assertShifts(data.days);
    await this.updateOne(id, this.toEntityData(data));
    return { id };
  }

  /** Lịch đang / sắp được gán thì không xóa được; gán đã hết hạn vẫn đọc được lịch đã xóa */
  async remove(id: string) {
    await this.getActive(id);
    const inUse = await this.em.count(WorkScheduleAssignmentEntity, {
      schedule: id,
      deleted: false,
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: todayVn() } }],
    });
    if (inUse) throw new ConflictException("Work schedule is assigned to a company, department or user");
    return super.remove(id);
  }

  /**
   * Lịch tuần (không gửi mốc) neo vào WEEK_ANCHOR_DATE. Ca xoay theo tuần (14, 21… ngày): mốc chỉ để biết tuần nào là
   * tuần 1, lưu về thứ Hai của tuần đó để days[0] luôn là thứ Hai. Chu kỳ khác giữ mốc người dùng chọn.
   */
  private toEntityData(data: WorkScheduleDto) {
    if (!data.anchorDate) return { ...data, anchorDate: WEEK_ANCHOR_DATE };
    return { ...data, ...alignCycleToMonday(data.anchorDate, data.days) };
  }

  private async assertShifts(days: (string | null)[]) {
    const ids = [...new Set(days.filter((id): id is string => !!id))];
    if (ids.length && (await this.em.count(WorkShiftEntity, { id: { $in: ids }, deleted: false })) !== ids.length) {
      throw new BadRequestException("Work shift not found");
    }
  }

  private async getActive(id: string) {
    const schedule = await this.repo.findOne({ id, deleted: false }, { fields: ["id"] });
    if (!schedule) throw new NotFoundException("Work schedule not found");
    return schedule;
  }

  private async assertUniqueCode(code: string, exceptId?: string) {
    const exists = await this.repo.count({ code, deleted: false, ...(exceptId && { id: { $ne: exceptId } }) });
    if (exists) throw new ConflictException(`Work schedule with code "${code}" already exists`);
  }
}
