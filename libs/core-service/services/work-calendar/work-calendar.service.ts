import { PermissionType } from "@common/base/permission-type.enum";
import { EntityManager, FilterQuery } from "@mikro-orm/core";
import { ForbiddenException, Inject, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { type WorkCalendarListDto, type WorkCalendarRangeDto } from "../../controllers/work-calendar/work-calendar.validation";
import { DepartmentEntity } from "../../entities/department";
import { UserEntity } from "../../entities/user";
import { WorkDayOverrideEntity } from "../../entities/work-day-override";
import { WorkScheduleEntity } from "../../entities/work-schedule";
import { WorkScheduleAssignmentEntity, WorkTargetType } from "../../entities/work-schedule-assignment";
import { WorkShiftEntity } from "../../entities/work-shift";
import { type AssignmentLite, type CalendarData, type ChainLevel, overrideKey, resolveWorkDays, targetKey } from "./work-calendar.resolver";

/** Giới hạn độ sâu khi leo cây phòng ban (phòng dữ liệu lỗi có vòng) */
const MAX_DEPTH = 50;

interface DepartmentNode {
  id: string;
  name: string;
  parentId: string | null;
}

const COMPANY_LEVEL: ChainLevel = { key: targetKey(WorkTargetType.Company), type: WorkTargetType.Company, id: null, name: "" };

/**
 * Tra ca làm việc theo ngày cho người / phòng ban. Nạp một lần mọi gán lịch, ngày đặc biệt, lịch và ca liên quan
 * rồi tính trong bộ nhớ (resolveWorkDays). Mỗi ngày chỉ trả shiftId — thông tin ca nằm ở `shifts`.
 */
@Injectable({ scope: Scope.REQUEST })
export class WorkCalendarService {
  constructor(
    private readonly em: EntityManager,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  myCalendar(range: WorkCalendarRangeDto) {
    return this.userCalendar(this.request.user.id, range, true);
  }

  /** Người xem chính mình luôn được; xem người khác cần quyền xem lịch (phòng ban thì người đó phải trong cây phòng của mình) */
  async userCalendar(userId: string, { from, to }: WorkCalendarRangeDto, self = userId === this.request.user.id) {
    const user = await this.em.findOne(
      UserEntity,
      { id: userId, deleted: false },
      { fields: ["id", "fullName", "avatar", "department"], disableIdentityMap: true },
    );
    if (!user) throw new NotFoundException("User not found");
    const departments = await this.loadDepartments();
    const departmentId = user.department?.id ?? null;
    if (!self) this.assertScope(departmentId, departments);

    const chain = [this.userLevel(user), ...this.departmentChain(departmentId, departments)];
    const data = await this.loadData(
      chain.filter((l) => l.type === WorkTargetType.Department).map((l) => l.id),
      [user.id],
      from,
      to,
    );
    const days = resolveWorkDays(chain, data, from, to);
    return {
      user: { id: user.id, fullName: user.fullName, avatar: user.avatar },
      department: departmentId ? { id: departmentId, name: departments.get(departmentId)?.name } : null,
      days,
      shifts: this.usedShifts(data, [days]),
    };
  }

  /** Lịch của phòng (cấp phòng, chưa tính lịch riêng của người) và của từng nhân viên đang hoạt động trong phòng / cây phòng */
  /**
   * Lịch của nhiều nhân viên đang hoạt động (phân trang, tìm theo tên) + dòng lịch chung của phạm vi:
   * - chọn phòng: phòng đó (kèm phòng con nếu includeChildren), phải nằm trong phạm vi được xem;
   * - bỏ trống: quyền xem toàn bộ → cả công ty (dòng chung = lịch cấp công ty), quyền phòng ban → cây phòng của mình.
   */
  async calendarList({ from, to, departmentId, includeChildren, keyword, page, limit }: WorkCalendarListDto) {
    const departments = await this.loadDepartments();
    const viewer = this.request.user;
    let scopeId: string | null = null;
    let departmentIds: string[] | null = null;

    if (departmentId) {
      if (!departments.has(departmentId)) throw new NotFoundException("Department not found");
      this.assertScope(departmentId, departments);
      scopeId = departmentId;
      departmentIds = includeChildren ? this.subtreeIds(departmentId, departments) : [departmentId];
    } else if (!viewer.canAccess([PermissionType.ViewWorkCalendarAll])) {
      const ownId = viewer.department?.id;
      if (!ownId || !departments.has(ownId)) throw new ForbiddenException("Outside your work calendar scope");
      scopeId = ownId;
      departmentIds = this.subtreeIds(ownId, departments);
    }

    const where: FilterQuery<UserEntity> = { isActive: true, deleted: false };
    if (departmentIds) where.department = { $in: departmentIds };
    if (keyword) where.fullName = { $ilike: `%${keyword.replace(/[%_\\]/g, "\\$&")}%` };
    const [users, total] = await this.em.findAndCount(UserEntity, where, {
      fields: ["id", "fullName", "avatar", "department"],
      // Giống các danh sách khác: người mới cập nhật lên đầu; id giữ thứ tự ổn định khi phân trang
      orderBy: { updatedAt: "DESC", id: "ASC" },
      limit,
      offset: (page - 1) * limit,
      disableIdentityMap: true,
    });

    const scopeChain = this.departmentChain(scopeId, departments);
    const chains = new Map<string | null, ChainLevel[]>();
    for (const id of new Set(users.map((u) => u.department?.id ?? null))) chains.set(id, this.departmentChain(id, departments));
    const chainIds = [...scopeChain, ...[...chains.values()].flat()].filter((l) => l.type === WorkTargetType.Department).map((l) => l.id);
    const data = await this.loadData(
      chainIds,
      users.map((u) => u.id),
      from,
      to,
    );

    const days = resolveWorkDays(scopeChain, data, from, to);
    const userRows = users.map((user) => {
      const userDepartmentId = user.department?.id ?? null;
      return {
        user: { id: user.id, fullName: user.fullName, avatar: user.avatar },
        department: userDepartmentId ? { id: userDepartmentId, name: departments.get(userDepartmentId)?.name } : null,
        days: resolveWorkDays([this.userLevel(user), ...chains.get(userDepartmentId)], data, from, to),
      };
    });

    return {
      /** Phạm vi của dòng lịch chung; null = cả công ty */
      department: scopeId ? { id: scopeId, name: departments.get(scopeId)?.name } : null,
      days,
      users: userRows,
      total,
      shifts: this.usedShifts(data, [days, ...userRows.map((r) => r.days)]),
    };
  }

  private userLevel(user: { id: string; fullName: string }): ChainLevel {
    return { key: targetKey(WorkTargetType.User, user.id), type: WorkTargetType.User, id: user.id, name: user.fullName };
  }

  /** [phòng, cha, ông, …, công ty] */
  private departmentChain(departmentId: string | null, departments: Map<string, DepartmentNode>): ChainLevel[] {
    const chain: ChainLevel[] = [];
    let node = departmentId ? departments.get(departmentId) : undefined;
    while (node && chain.length < MAX_DEPTH && !chain.some((l) => l.id === node.id)) {
      chain.push({ key: targetKey(WorkTargetType.Department, node.id), type: WorkTargetType.Department, id: node.id, name: node.name });
      node = node.parentId ? departments.get(node.parentId) : undefined;
    }
    return [...chain, COMPANY_LEVEL];
  }

  private subtreeIds(rootId: string, departments: Map<string, DepartmentNode>): string[] {
    const children = new Map<string, string[]>();
    for (const node of departments.values()) {
      if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    }
    const ids = [rootId];
    for (let i = 0; i < ids.length && ids.length < departments.size + 1; i++) {
      for (const child of children.get(ids[i]) ?? []) if (!ids.includes(child)) ids.push(child);
    }
    return ids;
  }

  /** Quyền xem toàn bộ, hoặc quyền phòng ban và phòng cần xem nằm trong cây phòng của người xem */
  private assertScope(departmentId: string | null, departments: Map<string, DepartmentNode>) {
    const viewer = this.request.user;
    if (viewer.canAccess([PermissionType.ViewWorkCalendarAll])) return;
    const ownId = viewer.department?.id;
    if (
      ownId &&
      departmentId &&
      viewer.canAccess([PermissionType.ViewWorkCalendarDepartment]) &&
      this.departmentChain(departmentId, departments).some((l) => l.id === ownId)
    ) {
      return;
    }
    throw new ForbiddenException("Outside your work calendar scope");
  }

  private async loadDepartments(): Promise<Map<string, DepartmentNode>> {
    const rows = await this.em.find(DepartmentEntity, { deleted: false }, { fields: ["id", "name", "parent"], disableIdentityMap: true });
    return new Map(rows.map((d) => [d.id, { id: d.id, name: d.name, parentId: d.parent?.id ?? null }]));
  }

  /** Gán lịch + ngày đặc biệt của công ty, các phòng và người trong khoảng; lịch và ca kể cả đã xóa (gán cũ vẫn tham chiếu) */
  private async loadData(departmentIds: (string | null)[], userIds: string[], from: string, to: string): Promise<CalendarData> {
    const deptIds = [...new Set(departmentIds.filter((id): id is string => !!id))];
    const targets = [{ targetType: WorkTargetType.Company }, { department: { $in: deptIds } }, { user: { $in: userIds } }];

    const [assignments, overrides] = await Promise.all([
      this.em.find(
        WorkScheduleAssignmentEntity,
        {
          deleted: false,
          effectiveFrom: { $lte: to },
          $and: [{ $or: [{ effectiveTo: null }, { effectiveTo: { $gte: from } }] }, { $or: targets }],
        },
        { fields: ["targetType", "department", "user", "schedule", "effectiveFrom", "effectiveTo"], disableIdentityMap: true },
      ),
      this.em.find(
        WorkDayOverrideEntity,
        { deleted: false, date: { $gte: from, $lte: to }, $or: targets },
        { fields: ["targetType", "department", "user", "date", "type", "shift", "name"], disableIdentityMap: true },
      ),
    ]);

    const scheduleIds = [...new Set(assignments.map((a) => a.schedule.id))];
    const schedules = scheduleIds.length
      ? await this.em.find(
          WorkScheduleEntity,
          { id: { $in: scheduleIds } },
          { fields: ["id", "code", "name", "cycleDays", "anchorDate", "days", "ignoreHolidays"], disableIdentityMap: true },
        )
      : [];

    const shiftIds = [
      ...new Set([...schedules.flatMap((s) => s.days), ...overrides.map((o) => o.shift?.id)].filter((id): id is string => !!id)),
    ];
    const shifts = shiftIds.length
      ? await this.em.find(
          WorkShiftEntity,
          { id: { $in: shiftIds } },
          { fields: ["id", "code", "name", "color", "segments", "workMinutes"], disableIdentityMap: true },
        )
      : [];

    const keyOf = (row: { targetType: WorkTargetType; department?: { id: string }; user?: { id: string } }) =>
      targetKey(row.targetType, row.department?.id ?? row.user?.id);
    const byTarget = new Map<string, AssignmentLite[]>();
    for (const a of assignments) {
      const key = keyOf(a);
      byTarget.set(key, [
        ...(byTarget.get(key) ?? []),
        { scheduleId: a.schedule.id, effectiveFrom: a.effectiveFrom, effectiveTo: a.effectiveTo },
      ]);
    }

    return {
      shifts: new Map(
        shifts.map((s) => [
          s.id,
          { id: s.id, code: s.code, name: s.name, color: s.color, segments: s.segments, workMinutes: s.workMinutes },
        ]),
      ),
      schedules: new Map(
        schedules.map((s) => [
          s.id,
          {
            id: s.id,
            code: s.code,
            name: s.name,
            cycleDays: s.cycleDays,
            anchorDate: s.anchorDate,
            days: s.days,
            ignoreHolidays: s.ignoreHolidays,
          },
        ]),
      ),
      assignments: byTarget,
      overrides: new Map(
        overrides.map((o) => [overrideKey(keyOf(o), o.date), { id: o.id, type: o.type, shiftId: o.shift?.id ?? null, name: o.name }]),
      ),
    };
  }

  private usedShifts(data: CalendarData, rows: { shiftId: string | null }[][]) {
    const ids = new Set(rows.flat().map((d) => d.shiftId));
    return [...data.shifts.values()].filter((s) => ids.has(s.id));
  }
}
