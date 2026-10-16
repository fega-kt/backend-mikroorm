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
