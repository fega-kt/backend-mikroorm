export interface ParsedUserAgent {
  browser: string;
  os: string;
}

/** Thứ tự quan trọng: Edge/Opera/Samsung đều chứa "Chrome", Chrome chứa "Safari" */
const BROWSERS: Array<[string, RegExp]> = [
  ["Edge", /Edg(e|A|iOS)?\//],
  ["Opera", /OPR\/|Opera/],
  ["Samsung Internet", /SamsungBrowser\//],
  ["Firefox", /Firefox\/|FxiOS\//],
  ["Chrome", /Chrome\/|CriOS\//],
  ["Safari", /Safari\//],
];

/** iOS/Android trước Mac/Linux: UA iPad chứa "Mac OS X", UA Android chứa "Linux" */
const OPERATING_SYSTEMS: Array<[string, RegExp]> = [
  ["iOS", /iPhone|iPad|iPod/],
  ["Android", /Android/],
  ["Windows", /Windows/],
  ["macOS", /Mac OS X|Macintosh/],
  ["ChromeOS", /CrOS/],
  ["Linux", /Linux/],
];

const UNKNOWN = "Unknown";

/** Nhận diện trình duyệt + hệ điều hành từ user agent để hiển thị (không dùng để định danh thiết bị) */
export function parseUserAgent(userAgent: string | undefined): ParsedUserAgent {
  const ua = userAgent ?? "";
  const browser = BROWSERS.find(([, pattern]) => pattern.test(ua))?.[0] ?? UNKNOWN;
  const os = OPERATING_SYSTEMS.find(([, pattern]) => pattern.test(ua))?.[0] ?? UNKNOWN;
  return { browser, os };
}
