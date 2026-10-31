import { describe, expect, it } from "vitest";
import { WorkDayType } from "../../entities/work-day-override";
import { WorkTargetType } from "../../entities/work-schedule-assignment";
import { WEEK_ANCHOR_DATE } from "../../entities/work-schedule";
import {
  type AssignmentLite,
  type CalendarData,
  type ChainLevel,
  type OverrideLite,
  type ScheduleLite,
  type ShiftLite,
  overrideKey,
  resolveWorkDays,
  targetKey,
  WorkDayStatus,
} from "./work-calendar.resolver";
import { alignCycleToMonday, segmentTimeline, workMinutesOf } from "./work-calendar.util";

const shift = (id: string): ShiftLite => ({ id, code: id, name: id, segments: [{ start: "08:00", end: "17:00" }], workMinutes: 540 });
const office = shift("HC");
const night = shift("DEM");

const weekly = (id: string, days: (string | null)[], ignoreHolidays = false): ScheduleLite => ({
  id,
  code: id,
  name: id,
  cycleDays: 7,
  anchorDate: WEEK_ANCHOR_DATE,
  days,
  ignoreHolidays,
});
// T2–T6 hành chính, T7 + CN nghỉ
const monFri = weekly("MON_FRI", ["HC", "HC", "HC", "HC", "HC", null, null]);
const everyDay = weekly("TRUC", ["DEM", "DEM", "DEM", "DEM", "DEM", "DEM", "DEM"], true);

const user: ChainLevel = { key: targetKey(WorkTargetType.User, "u1"), type: WorkTargetType.User, id: "u1", name: "A" };
const team: ChainLevel = { key: targetKey(WorkTargetType.Department, "team"), type: WorkTargetType.Department, id: "team", name: "Nhóm" };
const dept: ChainLevel = { key: targetKey(WorkTargetType.Department, "dept"), type: WorkTargetType.Department, id: "dept", name: "Phòng" };
const company: ChainLevel = { key: targetKey(WorkTargetType.Company), type: WorkTargetType.Company, id: null, name: "Công ty" };
const chain = [user, team, dept, company];

function data(assignments: [ChainLevel, AssignmentLite][], overrides: [ChainLevel, string, Omit<OverrideLite, "id">][] = []): CalendarData {
  const byTarget = new Map<string, AssignmentLite[]>();
  for (const [level, a] of assignments) byTarget.set(level.key, [...(byTarget.get(level.key) ?? []), a]);
  return {
    shifts: new Map([office, night].map((s) => [s.id, s])),
    schedules: new Map([monFri, everyDay].map((s) => [s.id, s])),
    assignments: byTarget,
    overrides: new Map(overrides.map(([level, date, o], i) => [overrideKey(level.key, date), { id: `o${i}`, ...o }])),
  };
}

const forever = (scheduleId: string): AssignmentLite => ({ scheduleId, effectiveFrom: "2020-01-01" });

describe("resolveWorkDays", () => {
  it("phòng nhỏ không có lịch thì lấy lịch phòng lớn, rồi tới công ty", () => {
    // 2026-11-02 là thứ Hai, 2026-11-07 là thứ Bảy
    const days = resolveWorkDays(chain, data([[company, forever("MON_FRI")]]), "2026-11-02", "2026-11-08");
    expect(days.map((d) => d.status)).toEqual(["work", "work", "work", "work", "work", "off", "off"]);
    expect(days[0].source).toMatchObject({ kind: "schedule", targetType: WorkTargetType.Company });

    const fromDept = resolveWorkDays(
      chain,
      data([
        [company, forever("MON_FRI")],
        [dept, forever("TRUC")],
      ]),
      "2026-11-07",
      "2026-11-07",
    );
    expect(fromDept[0]).toMatchObject({ status: WorkDayStatus.Work, shiftId: "DEM", source: { targetId: "dept" } });
  });

  it("không cấp nào có lịch → none", () => {
    expect(resolveWorkDays(chain, data([]), "2026-11-02", "2026-11-02")[0].status).toBe(WorkDayStatus.None);
  });

  it("theo khoảng hiệu lực của lịch", () => {
    const d = data([
      [dept, { scheduleId: "MON_FRI", effectiveFrom: "2026-01-01", effectiveTo: "2026-11-03" }],
      [dept, { scheduleId: "TRUC", effectiveFrom: "2026-11-04" }],
    ]);
    const days = resolveWorkDays(chain, d, "2026-11-03", "2026-11-04");
    expect(days.map((x) => x.shiftId)).toEqual(["HC", "DEM"]);
  });

  it("ngày lễ cấp công ty thắng lịch tuần của phòng; người có ngày làm riêng thắng ngày lễ", () => {
    const d = data(
      [[dept, forever("MON_FRI")]],
      [
        [company, "2026-11-02", { type: WorkDayType.Off, name: "Lễ" }],
        [user, "2026-11-02", { type: WorkDayType.Work, shiftId: "DEM", name: "Trực lễ" }],
      ],
    );
    expect(resolveWorkDays([team, dept, company], d, "2026-11-02", "2026-11-02")[0]).toMatchObject({
      status: WorkDayStatus.Off,
      source: { kind: "override", targetType: WorkTargetType.Company, refName: "Lễ" },
    });
    expect(resolveWorkDays(chain, d, "2026-11-02", "2026-11-02")[0]).toMatchObject({ status: WorkDayStatus.Work, shiftId: "DEM" });
  });

  it("lịch trực bỏ qua ngày nghỉ của cấp rộng hơn, vẫn theo ngày nghỉ riêng", () => {
    const holiday = data([[team, forever("TRUC")]], [[company, "2026-11-02", { type: WorkDayType.Off, name: "Lễ" }]]);
    expect(resolveWorkDays(chain, holiday, "2026-11-02", "2026-11-02")[0]).toMatchObject({
      status: WorkDayStatus.Work,
      source: { kind: "schedule", targetId: "team" },
    });

    const personal = data([[team, forever("TRUC")]], [[user, "2026-11-02", { type: WorkDayType.Off, name: "Nghỉ" }]]);
    expect(resolveWorkDays(chain, personal, "2026-11-02", "2026-11-02")[0].status).toBe(WorkDayStatus.Off);
  });

  it("ca xoay: chu kỳ 3 ngày làm 2 nghỉ 1 tính từ mốc", () => {
    const rotating: ScheduleLite = { ...weekly("XOAY", ["DEM", "DEM", null]), cycleDays: 3, anchorDate: "2026-11-01" };
    const d = data([[user, forever("XOAY")]]);
    d.schedules.set(rotating.id, rotating);
    const days = resolveWorkDays(chain, d, "2026-10-30", "2026-11-04");
    // 30/10 = mốc - 2 → days[1]; 31/10 → days[2]; 1/11 → days[0] ...
    expect(days.map((x) => x.status)).toEqual(["work", "off", "work", "work", "off", "work"]);
  });
});

describe("segmentTimeline", () => {
  it("tính giờ ca hành chính và ca qua đêm", () => {
    expect(
      workMinutesOf([
        { start: "08:00", end: "12:00" },
        { start: "13:30", end: "17:30" },
      ]),
    ).toBe(480);
    expect(
      workMinutesOf([
        { start: "22:00", end: "02:00" },
        { start: "02:30", end: "06:00" },
      ]),
    ).toBe(450);
  });

  it("từ chối khung chồng nhau, rỗng hoặc ca dài quá 24 giờ", () => {
    expect(
      segmentTimeline([
        { start: "08:00", end: "12:00" },
        { start: "11:00", end: "13:00" },
      ]),
    ).toBeNull();
    expect(segmentTimeline([{ start: "08:00", end: "08:00" }])).toBeNull();
    expect(segmentTimeline([])).toBeNull();
    expect(
      segmentTimeline([
        { start: "08:00", end: "20:00" },
        { start: "21:00", end: "09:00" },
      ]),
    ).toBeNull();
  });
});

describe("alignCycleToMonday", () => {
  it("dời mốc về thứ Hai của tuần chứa mốc, ca từng ngày không đổi", () => {
    // 01/01/2026 là thứ Năm; chu kỳ 14 ngày, mốc cũ: days[k] = ca của ngày (mốc + k)
    const days = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
    const aligned = alignCycleToMonday("2026-01-01", days);
    expect(aligned.anchorDate).toBe("2025-12-29");
    expect(aligned.days[0]).toBe("L"); // 29/12/2025 = mốc cũ - 3 → days[11]
    expect(aligned.days[3]).toBe("A"); // 01/01/2026 = mốc cũ

    const before = data([[company, forever("X")]]);
    const after = data([[company, forever("X")]]);
    const shiftsOf = (d: string[]) => d.map((id) => (id === "A" || id === "H" ? null : "HC"));
    before.schedules.set("X", { ...weekly("X", []), cycleDays: 14, anchorDate: "2026-01-01", days: shiftsOf(days) });
    after.schedules.set("X", { ...weekly("X", []), cycleDays: 14, anchorDate: aligned.anchorDate, days: shiftsOf(aligned.days) });
    expect(resolveWorkDays(chain, after, "2025-12-01", "2026-03-01")).toEqual(resolveWorkDays(chain, before, "2025-12-01", "2026-03-01"));
  });

  it("giữ nguyên chu kỳ không theo tuần hoặc mốc đã là thứ Hai", () => {
    expect(alignCycleToMonday("2026-01-01", ["A", "B", "C"])).toEqual({ anchorDate: "2026-01-01", days: ["A", "B", "C"] });
    const week = ["A", "B", "C", "D", "E", "F", "G"];
    expect(alignCycleToMonday("2026-01-05", week)).toEqual({ anchorDate: "2026-01-05", days: week });
  });
});
