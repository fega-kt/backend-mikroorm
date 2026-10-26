import { z } from "zod";

/** Phạm vi chung của các báo cáo: phòng ban (gồm phòng con) và loại tờ trình */
const scopeFilter = {
  departmentId: z.string().uuid().optional(),
  requestTypeId: z.string().uuid().optional(),
};

const MAX_RANGE_MS = 366 * 24 * 3600 * 1000;

/** Báo cáo theo khoảng thời gian [from, to); không truyền thì lấy 30 ngày gần nhất */
export const reportRangeValidation = z
  .object({
    ...scopeFilter,
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from < v.to, { message: "from must be before to", path: ["from"] })
  .refine((v) => !v.from || !v.to || v.to.getTime() - v.from.getTime() <= MAX_RANGE_MS, {
    message: "Range must not exceed one year",
    path: ["to"],
  });

/** Báo cáo tồn đọng: tính tại thời điểm hiện tại, không theo khoảng thời gian */
export const reportScopeValidation = z.object(scopeFilter);

export type ReportRangeDto = z.infer<typeof reportRangeValidation>;
export type ReportScopeDto = z.infer<typeof reportScopeValidation>;
