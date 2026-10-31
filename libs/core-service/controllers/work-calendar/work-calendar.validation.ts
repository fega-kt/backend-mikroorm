import z from "zod";
import { WorkDayType } from "../../entities/work-day-override";
import { WorkTargetType } from "../../entities/work-schedule-assignment";
import { daysBetween, isValidDate, MAX_RANGE_DAYS, segmentTimeline } from "../../services/work-calendar/work-calendar.util";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");
const date = z.string().refine(isValidDate, "Date must be YYYY-MM-DD");
const code = z
  .string()
  .trim()
  .min(1, "Code is required")
  .max(50, "Code must be less than 50 characters")
  .regex(/^[A-Za-z0-9_-]+$/, "Code may contain only letters, numbers, '_' and '-'")
  .transform((v) => v.toUpperCase());
const name = z.string().trim().min(1, "Name is required").max(255, "Name must be less than 255 characters");
const description = z.string().max(500, "Description must be less than 500 characters").nullish();
const booleanQuery = z.enum(["true", "false"]).transform((v) => v === "true");

/** Ca làm việc */
export const workShiftValidation = z.object({
  code,
  name,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be #rrggbb")
    .nullish(),
  segments: z
    .array(z.object({ start: time, end: time }))
    .min(1, "At least one time segment is required")
    .max(6, "At most 6 time segments")
    .refine((segments) => segmentTimeline(segments) !== null, "Time segments overlap or the shift exceeds 24 hours"),
  description,
});

export type WorkShiftDto = z.infer<typeof workShiftValidation>;

/** Lịch làm việc theo chu kỳ (mặc định tuần: days[0] = thứ Hai) */
export const workScheduleValidation = z
  .object({
    code,
    name,
    cycleDays: z.number().int().min(1).max(60).default(7),
    /** Ngày ứng với days[0]; lịch tuần bỏ trống */
    anchorDate: date.nullish(),
    days: z.array(z.uuid().nullable()),
    ignoreHolidays: z.boolean().default(false),
    description,
  })
  .superRefine((v, ctx) => {
    if (v.days.length !== v.cycleDays) {
      ctx.addIssue({ code: "custom", path: ["days"], message: "Days must have exactly cycleDays items" });
    }
    if (v.cycleDays !== 7 && !v.anchorDate) {
      ctx.addIssue({ code: "custom", path: ["anchorDate"], message: "Anchor date is required for non-weekly cycles" });
    }
  });

export type WorkScheduleDto = z.infer<typeof workScheduleValidation>;

/** Đối tượng: công ty (không cần id) / phòng ban (departmentId) / người (userId) */
const target = z.object({
  targetType: z.enum(WorkTargetType),
  departmentId: z.uuid().nullish(),
  userId: z.uuid().nullish(),
});

export type WorkTargetDto = z.infer<typeof target>;

function refineTarget(v: WorkTargetDto, ctx: z.RefinementCtx) {
  if (v.targetType === WorkTargetType.Department && !v.departmentId) {
    ctx.addIssue({ code: "custom", path: ["departmentId"], message: "Department is required" });
  }
  if (v.targetType === WorkTargetType.User && !v.userId) {
    ctx.addIssue({ code: "custom", path: ["userId"], message: "User is required" });
  }
}

function refineRange(from: string | undefined, to: string | null | undefined, ctx: z.RefinementCtx, maxDays?: number) {
  if (!from || !to) return;
  if (to < from) ctx.addIssue({ code: "custom", path: ["to"], message: "End date must not be before start date" });
  else if (maxDays && daysBetween(from, to) >= maxDays) {
    ctx.addIssue({ code: "custom", path: ["to"], message: `Range must not exceed ${maxDays} days` });
  }
}

/** Gán lịch */
export const createWorkAssignmentValidation = target
  .extend({ scheduleId: z.uuid(), effectiveFrom: date, effectiveTo: date.nullish() })
  .superRefine((v, ctx) => {
    refineTarget(v, ctx);
    refineRange(v.effectiveFrom, v.effectiveTo, ctx);
  });

export type CreateWorkAssignmentDto = z.infer<typeof createWorkAssignmentValidation>;

export const updateWorkAssignmentValidation = z
  .object({ scheduleId: z.uuid(), effectiveFrom: date, effectiveTo: date.nullish() })
  .superRefine((v, ctx) => refineRange(v.effectiveFrom, v.effectiveTo, ctx));

export type UpdateWorkAssignmentDto = z.infer<typeof updateWorkAssignmentValidation>;

export const workAssignmentFilterValidation = z.object({
  targetType: z.enum(WorkTargetType).optional(),
  departmentId: z.uuid().optional(),
  userId: z.uuid().optional(),
});

export type WorkAssignmentFilterDto = z.infer<typeof workAssignmentFilterValidation>;

function refineDayType(v: { type: WorkDayType; shiftId?: string | null }, ctx: z.RefinementCtx) {
  if (v.type === WorkDayType.Work && !v.shiftId) {
    ctx.addIssue({ code: "custom", path: ["shiftId"], message: "Shift is required for a working day" });
  }
}

/** Ngày đặc biệt: tạo cho cả khoảng [from, to], ngày đã có của cùng đối tượng thì ghi đè */
export const createWorkDayOverrideValidation = target
  .extend({ from: date, to: date, type: z.enum(WorkDayType), shiftId: z.uuid().nullish(), name })
  .superRefine((v, ctx) => {
    refineTarget(v, ctx);
    refineRange(v.from, v.to, ctx, MAX_RANGE_DAYS);
    refineDayType(v, ctx);
  });

export type CreateWorkDayOverrideDto = z.infer<typeof createWorkDayOverrideValidation>;

export const updateWorkDayOverrideValidation = z
  .object({ type: z.enum(WorkDayType), shiftId: z.uuid().nullish(), name })
  .superRefine(refineDayType);

export type UpdateWorkDayOverrideDto = z.infer<typeof updateWorkDayOverrideValidation>;

export const workDayOverrideFilterValidation = z
  .object({
    from: date,
    to: date,
    targetType: z.enum(WorkTargetType).optional(),
    departmentId: z.uuid().optional(),
    userId: z.uuid().optional(),
  })
  .superRefine((v, ctx) => refineRange(v.from, v.to, ctx, MAX_RANGE_DAYS));

export type WorkDayOverrideFilterDto = z.infer<typeof workDayOverrideFilterValidation>;

/** Chép ngày đặc biệt của một đối tượng từ năm này sang năm khác (cùng ngày / tháng; ngày đã có thì bỏ qua) */
export const copyWorkDayOverrideValidation = target
  .extend({ fromYear: z.number().int().min(2000).max(2100), toYear: z.number().int().min(2000).max(2100) })
  .superRefine((v, ctx) => {
    refineTarget(v, ctx);
    if (v.fromYear === v.toYear) ctx.addIssue({ code: "custom", path: ["toYear"], message: "Target year must differ" });
  });

export type CopyWorkDayOverrideDto = z.infer<typeof copyWorkDayOverrideValidation>;

/** Tra lịch */
export const workCalendarRangeValidation = z
  .object({ from: date, to: date })
  .superRefine((v, ctx) => refineRange(v.from, v.to, ctx, MAX_RANGE_DAYS));

export type WorkCalendarRangeDto = z.infer<typeof workCalendarRangeValidation>;

/** Lịch nhiều nhân viên: bỏ trống phòng = toàn bộ trong phạm vi được xem */
export const workCalendarListValidation = z
  .object({
    from: date,
    to: date,
    departmentId: z.uuid().optional(),
    includeChildren: booleanQuery.default(false),
    keyword: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .superRefine((v, ctx) => refineRange(v.from, v.to, ctx, 62));

export type WorkCalendarListDto = z.infer<typeof workCalendarListValidation>;
