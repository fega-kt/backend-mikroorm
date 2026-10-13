import { Readable } from "stream";
import { describe, expect, it } from "vitest";
import { type ByteRange, orderedParallelStream, parseContentRangeTotal, splitByteRanges } from "./parallel-range-stream";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const source = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

async function collect(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe("splitByteRanges / parseContentRangeTotal", () => {
  it("chia liên tiếp, đoạn cuối ngắn hơn, end tính cả byte cuối", () => {
    expect(splitByteRanges(100, 350, 100)).toEqual([
      { start: 100, end: 199 },
      { start: 200, end: 299 },
      { start: 300, end: 349 },
    ]);
    expect(splitByteRanges(100, 100, 100)).toEqual([]);
  });

  it("đọc tổng dung lượng từ Content-Range", () => {
    expect(parseContentRangeTotal("bytes 0-4194303/22053737")).toBe(22053737);
    expect(parseContentRangeTotal(undefined)).toBeUndefined();
  });
});

describe("orderedParallelStream", () => {
  it("ghép đúng thứ tự dù các đoạn tải xong lộn xộn, không vượt quá số kết nối", async () => {
    let active = 0;
    let maxActive = 0;
    const fetchRange = async ({ start, end }: ByteRange) => {
      active++;
      maxActive = Math.max(maxActive, active);
      // Đoạn sau xong trước đoạn trước
      await sleep(30 - (start / 100) * 3);
      active--;
      return new Uint8Array(source.subarray(start, end + 1));
    };
    const head = Readable.from([source.subarray(0, 100)]);

    const result = await collect(orderedParallelStream(splitByteRanges(100, 1000, 100), 3, fetchRange, head));

    expect(result.equals(source)).toBe(true);
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("một đoạn lỗi thì stream lỗi và các đoạn đang tải bị hủy", async () => {
    const signals: AbortSignal[] = [];
    const fetchRange = async ({ start, end }: ByteRange, signal: AbortSignal) => {
      signals.push(signal);
      await sleep(10);
      if (start === 200) throw new Error("boom");
      return new Uint8Array(source.subarray(start, end + 1));
    };

    await expect(collect(orderedParallelStream(splitByteRanges(0, 1000, 100), 4, fetchRange))).rejects.toThrow("boom");
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("người nhận ngắt giữa chừng thì hủy các đoạn đang tải", async () => {
    let signal: AbortSignal | undefined;
    const fetchRange = async ({ start, end }: ByteRange, s: AbortSignal) => {
      signal = s;
      await sleep(5);
      return new Uint8Array(source.subarray(start, end + 1));
    };
    const stream = orderedParallelStream(splitByteRanges(0, 1000, 100), 2, fetchRange);

    for await (const _chunk of stream) break;

    expect(signal?.aborted).toBe(true);
  });
});
