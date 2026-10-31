import { type ShiftSegment } from "../../entities/work-shift";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_MINUTES = 24 * 60;

/** Số ngày tối đa của một lần tra lịch / tạo ngày đặc biệt theo khoảng */
export const MAX_RANGE_DAYS = 366;

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Ngày YYYY-MM-DD cộng n ngày */
export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * DAY_MS);
}

/** Số ngày từ a đến b (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** Các ngày trong [from, to], tính cả hai đầu */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** Ngày hợp lệ thật (loại 2026-02-30) */
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && fromUtc(toUtc(date)) === date;
}

/** Thứ trong tuần, 0 = thứ Hai … 6 = Chủ nhật */
export function weekdayOf(date: string): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7;
}

/**
 * Chu kỳ theo tuần (số ngày chia hết cho 7): dời mốc về thứ Hai của tuần chứa mốc và xoay days tương ứng,
 * để days[0] luôn là thứ Hai mà ca thực tế từng ngày không đổi. Chu kỳ khác giữ nguyên.
 */
export function alignCycleToMonday<T>(anchorDate: string, days: T[]): { anchorDate: string; days: T[] } {
  const shift = weekdayOf(anchorDate);
  if (days.length % 7 !== 0 || shift === 0) return { anchorDate, days };
  // Ngày (thứ Hai + j) = mốc cũ + (j - shift) → lấy days[(j - shift) mod n]
  const n = days.length;
  return {
    anchorDate: addDays(anchorDate, -shift),
    days: days.map((_, j) => days[(((j - shift) % n) + n) % n]),
  };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Trải các khung giờ lên trục phút liên tục (khung bắt đầu sớm hơn khung trước, hoặc kết thúc không sau giờ bắt đầu,
 * được hiểu là sang ngày hôm sau). Trả null khi khung rỗng, chồng nhau hoặc cả ca dài quá 24 giờ.
 */
export function segmentTimeline(segments: ShiftSegment[]): { start: number; end: number }[] | null {
  if (!segments.length) return null;
  const timeline: { start: number; end: number }[] = [];
  let dayOffset = 0;
  let previousEnd = -Infinity;
  for (const segment of segments) {
    if (segment.start === segment.end) return null;
    let start = toMinutes(segment.start) + dayOffset;
    if (start < previousEnd) {
      dayOffset += DAY_MINUTES;
      start += DAY_MINUTES;
    }
    let end = toMinutes(segment.end) + dayOffset;
    if (end <= start) {
      dayOffset += DAY_MINUTES;
      end += DAY_MINUTES;
    }
    timeline.push({ start, end });
    previousEnd = end;
  }
  // Khung chồng lên khung trước bị đẩy sang hôm sau → cả ca vượt 24 giờ
  if (timeline[timeline.length - 1].end - timeline[0].start > DAY_MINUTES) return null;
  return timeline;
}

/** Tổng số phút làm của các khung giờ (khung không hợp lệ → 0) */
export function workMinutesOf(segments: ShiftSegment[]): number {
  return (segmentTimeline(segments) ?? []).reduce((sum, { start, end }) => sum + end - start, 0);
}
