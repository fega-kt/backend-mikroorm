import { describe, expect, it } from "vitest";
import { monthRangeVn, todayVn } from "./vn-date.util";

describe("todayVn", () => {
  it("returns the Vietnam-time date, not the UTC one", () => {
    expect(todayVn(new Date("2026-10-16T08:00:00Z"))).toBe("2026-10-16");
    // 16/10 20:00 UTC = 17/10 03:00 giờ VN
    expect(todayVn(new Date("2026-10-16T20:00:00Z"))).toBe("2026-10-17");
  });
});

describe("monthRangeVn", () => {
  it("covers the Vietnam-time month of `now`", () => {
    // 16/10/2026 08:00 UTC = 15:00 giờ VN
    const { from, to } = monthRangeVn(0, new Date("2026-10-16T08:00:00Z"));
    expect(from.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });

  it("uses the local month when UTC is still the previous day", () => {
    // 31/10/2026 20:00 UTC = 01/11/2026 03:00 giờ VN → đã sang tháng 11
    const { from } = monthRangeVn(0, new Date("2026-10-31T20:00:00Z"));
    expect(from.toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });

  it("supports the previous month and wraps over the year", () => {
    const { from, to } = monthRangeVn(-1, new Date("2026-01-10T00:00:00Z"));
    expect(from.toISOString()).toBe("2025-11-30T17:00:00.000Z");
    expect(to.toISOString()).toBe("2025-12-31T17:00:00.000Z");
  });
});
