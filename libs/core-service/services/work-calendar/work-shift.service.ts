import { BaseService } from "@common/base/base.service";
import { LIST_CACHE_TTL } from "@common/constants/list-cache.constant";
import { todayVn } from "@common/utils/vn-date.util";
import { EntityManager, EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { type WorkShiftDto } from "../../controllers/work-calendar/work-calendar.validation";
import { WorkDayOverrideEntity } from "../../entities/work-day-override";
import { WorkScheduleEntity } from "../../entities/work-schedule";
import { WorkShiftEntity } from "../../entities/work-shift";
import { workMinutesOf } from "./work-calendar.util";

@Injectable({ scope: Scope.REQUEST })
export class WorkShiftService extends BaseService<WorkShiftEntity> {
  protected readonly listCache = { ttl: LIST_CACHE_TTL.STATIC };

  constructor(
    @InjectRepository(WorkShiftEntity)
    protected readonly repo: EntityRepository<WorkShiftEntity>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  getList() {
    return this.cachedList("all", {}, () =>
      this.repo.find(
        { deleted: false },
        {
          fields: ["id", "code", "name", "color", "segments", "workMinutes", "description", "updatedAt"],
          orderBy: { code: "ASC" },
        },
      ),
    );
  }

  async createShift(data: WorkShiftDto) {
    await this.assertUniqueCode(data.code);
    const shift = await this.addOne({ ...data, workMinutes: workMinutesOf(data.segments) });
    return { id: shift.id };
  }

  async updateShift(id: string, data: WorkShiftDto) {
    await this.getActive(id);
    await this.assertUniqueCode(data.code, id);
    await this.updateOne(id, { ...data, workMinutes: workMinutesOf(data.segments) });
    return { id };
  }

  /** Ca đang nằm trong lịch làm việc hoặc ngày đặc biệt sắp tới thì không xóa được (lịch cũ vẫn đọc được ca đã xóa) */
  async remove(id: string) {
    await this.getActive(id);
    // Lịch làm việc ít bản ghi: đọc days rồi lọc trong bộ nhớ (qua ORM để đúng schema DB)
    const schedules = await this.em.find(WorkScheduleEntity, { deleted: false }, { fields: ["days"], disableIdentityMap: true });
    const inSchedule = schedules.some((s) => s.days.includes(id));
    const upcoming = await this.em.count(WorkDayOverrideEntity, { shift: id, deleted: false, date: { $gte: todayVn() } });
    if (inSchedule || upcoming) throw new ConflictException("Shift is used by work schedules or upcoming special days");
    return super.remove(id);
  }

  private async getActive(id: string) {
    const shift = await this.repo.findOne({ id, deleted: false }, { fields: ["id"] });
    if (!shift) throw new NotFoundException("Work shift not found");
    return shift;
  }

  private async assertUniqueCode(code: string, exceptId?: string) {
    const exists = await this.repo.count({ code, deleted: false, ...(exceptId && { id: { $ne: exceptId } }) });
    if (exists) throw new ConflictException(`Work shift with code "${code}" already exists`);
  }
}
