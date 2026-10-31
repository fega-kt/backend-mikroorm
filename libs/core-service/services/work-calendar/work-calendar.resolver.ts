import { type ShiftSegment } from "../../entities/work-shift";
import { WorkDayType } from "../../entities/work-day-override";
import { WorkTargetType } from "../../entities/work-schedule-assignment";
import { daysBetween, eachDate } from "./work-calendar.util";

export enum WorkDayStatus {
  Work = "work",
  Off = "off",
  /** Không cấp nào có lịch cho ngày này — thiếu cấu hình, khác với ngày nghỉ */
  None = "none",
}

export interface ShiftLite {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  segments: ShiftSegment[];
  workMinutes: number;
}

export interface ScheduleLite {
  id: string;
  code: string;
  name: string;
  cycleDays: number;
  anchorDate: string;
  days: (string | null)[];
  ignoreHolidays: boolean;
}

export interface AssignmentLite {
  scheduleId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface OverrideLite {
  id: string;
  type: WorkDayType;
  shiftId?: string | null;
  name: string;
}

/** Một cấp trong chuỗi lấy ca, gần người nhất trước: người → phòng → phòng cha … → công ty */
export interface ChainLevel {
  key: string;
  type: WorkTargetType;
  id: string | null;
  name: string;
}

export interface CalendarData {
  shifts: Map<string, ShiftLite>;
  schedules: Map<string, ScheduleLite>;
  /** Theo khóa cấp (targetKey) */
  assignments: Map<string, AssignmentLite[]>;
  /** Theo `${targetKey}|${date}` */
  overrides: Map<string, OverrideLite>;
}

export interface WorkDaySource {
  /** Lấy từ ngày đặc biệt hay từ lịch làm việc */
  kind: "override" | "schedule";
  targetType: WorkTargetType;
  targetId: string | null;
  targetName: string;
  /** Id + tên ngày đặc biệt / lịch làm việc */
  refId: string;
  refName: string;
}

export interface WorkDay {
  date: string;
  status: WorkDayStatus;
  shiftId: string | null;
  source: WorkDaySource | null;
}

export function targetKey(type: WorkTargetType, id?: string | null): string {
  return type === WorkTargetType.Company ? type : `${type}:${id}`;
}

export function overrideKey(target: string, date: string): string {
  return `${target}|${date}`;
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

/** Lịch làm việc đang hiệu lực gần người nhất; level = vị trí cấp trong chuỗi */
function findSchedule(chain: ChainLevel[], data: CalendarData, date: string) {
  for (let level = 0; level < chain.length; level++) {
    const assignment = data.assignments
      .get(chain[level].key)
      ?.find((a) => a.effectiveFrom <= date && (!a.effectiveTo || a.effectiveTo >= date));
    const schedule = assignment && data.schedules.get(assignment.scheduleId);
    if (schedule) return { level, schedule };
  }
  return null;
}

/**
 * Ca của từng ngày trong [from, to] theo chuỗi cấp:
 * 1. Ngày đặc biệt ở cấp gần nhất thắng lịch làm việc — trừ ngày nghỉ khai báo ở cấp rộng hơn nơi gán lịch trực (ignoreHolidays);
 * 2. Không có thì theo lịch làm việc đang hiệu lực ở cấp gần nhất, ca = days[(ngày - mốc) mod chu kỳ];
 * 3. Không cấp nào có lịch → None.
 */
export function resolveWorkDays(chain: ChainLevel[], data: CalendarData, from: string, to: string): WorkDay[] {
  return eachDate(from, to).map((date) => {
    const found = findSchedule(chain, data, date);

    for (let level = 0; level < chain.length; level++) {
      const override = data.overrides.get(overrideKey(chain[level].key, date));
      if (!override) continue;
      if (override.type === WorkDayType.Off && found?.schedule.ignoreHolidays && level > found.level) continue;
      const shift = override.type === WorkDayType.Work && override.shiftId ? data.shifts.get(override.shiftId) : undefined;
      return {
        date,
        status: shift ? WorkDayStatus.Work : WorkDayStatus.Off,
        shiftId: shift?.id ?? null,
        source: sourceOf(chain[level], "override", override.id, override.name),
      };
    }

    if (!found) return { date, status: WorkDayStatus.None, shiftId: null, source: null };

    const { schedule, level } = found;
    const shiftId = schedule.days[mod(daysBetween(schedule.anchorDate, date), schedule.cycleDays)];
    const shift = shiftId ? data.shifts.get(shiftId) : undefined;
    return {
      date,
      status: shift ? WorkDayStatus.Work : WorkDayStatus.Off,
      shiftId: shift?.id ?? null,
      source: sourceOf(chain[level], "schedule", schedule.id, schedule.name),
    };
  });
}

function sourceOf(level: ChainLevel, kind: WorkDaySource["kind"], refId: string, refName: string): WorkDaySource {
  return { kind, targetType: level.type, targetId: level.id, targetName: level.name, refId, refName };
}
