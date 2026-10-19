/** Múi giờ Việt Nam (UTC+7, không có giờ mùa hè) */
export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Khoảng thời gian [from, to) */
export interface DateRange {
  from: Date;
  to: Date;
}

/** Hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD */
export function todayVn(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TIMEZONE }).format(now);
}

/** Ngày theo giờ Việt Nam, dạng yyyyMM/dd (có số 0 đứng đầu nên xếp theo chữ cái cũng là xếp theo thời gian) */
export function monthDayPathVn(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}/${get("day")}`;
}

/** Khoảng [from, to) của một tháng theo giờ Việt Nam: offset 0 = tháng này, -1 = tháng trước */
export function monthRangeVn(offset = 0, now = new Date()): DateRange {
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const year = vnNow.getUTCFullYear();
  const month = vnNow.getUTCMonth() + offset;
  return {
    from: new Date(Date.UTC(year, month, 1) - VN_OFFSET_MS),
    to: new Date(Date.UTC(year, month + 1, 1) - VN_OFFSET_MS),
  };
}
