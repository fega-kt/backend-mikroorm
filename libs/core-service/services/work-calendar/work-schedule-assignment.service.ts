import { BaseService } from "@common/base/base.service";
import { EntityManager, EntityRepository, FilterQuery, ObjectQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import {
  type CreateWorkAssignmentDto,
  type UpdateWorkAssignmentDto,
  type WorkAssignmentFilterDto,
  type WorkTargetDto,
} from "../../controllers/work-calendar/work-calendar.validation";
import { WorkScheduleEntity } from "../../entities/work-schedule";
import { WorkScheduleAssignmentEntity } from "../../entities/work-schedule-assignment";
import { addDays } from "./work-calendar.util";
import { assertTarget, targetData, targetWhere } from "./work-target";

/** Khoảng hiệu lực [from, to]; to trống = không thời hạn */
function overlapWhere(from: string, to?: string | null): ObjectQuery<WorkScheduleAssignmentEntity> {
  return {
    ...(to && { effectiveFrom: { $lte: to } }),
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: from } }],
  };
}

@Injectable({ scope: Scope.REQUEST })
export class WorkScheduleAssignmentService extends BaseService<WorkScheduleAssignmentEntity> {
  constructor(
    @InjectRepository(WorkScheduleAssignmentEntity)
    protected readonly repo: EntityRepository<WorkScheduleAssignmentEntity>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  getList(filter: WorkAssignmentFilterDto) {
    const where: FilterQuery<WorkScheduleAssignmentEntity> = { deleted: false };
    if (filter.targetType) where.targetType = filter.targetType;
    if (filter.departmentId) where.department = filter.departmentId;
    if (filter.userId) where.user = filter.userId;
    return this.repo.find(where, {
      fields: [
        "id",
        "targetType",
        "effectiveFrom",
        "effectiveTo",
        "schedule.id",
        "schedule.code",
        "schedule.name",
        "department.id",
        "department.name",
        "user.id",
        "user.fullName",
        "user.avatar",
      ],
      populate: ["schedule", "department", "user"],
      orderBy: { targetType: "ASC", effectiveFrom: "DESC" },
      disableIdentityMap: true,
    });
  }

  /**
   * Gán lịch mới cho đối tượng. Lịch bắt đầu trước và còn hiệu lực trong khoảng mới được cắt ngắn tới hôm trước;
   * nếu nó kéo dài quá khoảng mới (gán tạm thời) thì phần sau được giữ lại thành một bản gán tiếp nối.
   * Gán bắt đầu trong khoảng mới thì từ chối — sửa hoặc xóa nó trước.
   */
  async createAssignment(data: CreateWorkAssignmentDto) {
    await assertTarget(this.em, data);
    await this.assertSchedule(data.scheduleId);
    const target = targetWhere(data);
    const { effectiveFrom: from, effectiveTo: to } = data;

    const id = await this.em.transactional(async (em) => {
      const overlapping = await em.find(WorkScheduleAssignmentEntity, { ...target, deleted: false, ...overlapWhere(from, to) });
      const later = overlapping.find((a) => a.effectiveFrom >= from);
      if (later) throw new ConflictException(`Overlaps the assignment starting on ${later.effectiveFrom}`);

      const defaults = this.getDefaultValuesForCreate();
      for (const previous of overlapping) {
        if (to && (!previous.effectiveTo || previous.effectiveTo > to)) {
          em.create(WorkScheduleAssignmentEntity, {
            ...targetData(em, this.targetOf(previous)),
            schedule: previous.schedule,
            effectiveFrom: addDays(to, 1),
            effectiveTo: previous.effectiveTo ?? null,
            ...defaults,
          });
        }
        previous.effectiveTo = addDays(from, -1);
        Object.assign(previous, this.getDefaultValuesForUpdate());
      }

      const assignment = em.create(WorkScheduleAssignmentEntity, {
        ...targetData(em, data),
        schedule: em.getReference(WorkScheduleEntity, data.scheduleId),
        effectiveFrom: from,
        effectiveTo: to ?? null,
        ...defaults,
      });
      await em.flush();
      return assignment.id;
    });
    return { id };
  }

  async updateAssignment(id: string, data: UpdateWorkAssignmentDto) {
    const assignment = await this.repo.findOne({ id, deleted: false });
    if (!assignment) throw new NotFoundException("Work schedule assignment not found");
    await this.assertSchedule(data.scheduleId);

    const conflict = await this.repo.findOne({
      ...targetWhere(this.targetOf(assignment)),
      id: { $ne: id },
      deleted: false,
      ...overlapWhere(data.effectiveFrom, data.effectiveTo),
    });
    if (conflict) throw new ConflictException(`Overlaps the assignment starting on ${conflict.effectiveFrom}`);

    await this.updateOne(id, {
      schedule: this.em.getReference(WorkScheduleEntity, data.scheduleId),
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
    });
    return { id };
  }

  private targetOf(assignment: WorkScheduleAssignmentEntity): WorkTargetDto {
    return { targetType: assignment.targetType, departmentId: assignment.department?.id, userId: assignment.user?.id };
  }

  private async assertSchedule(id: string) {
    if (!(await this.em.count(WorkScheduleEntity, { id, deleted: false }))) throw new BadRequestException("Work schedule not found");
  }
}
