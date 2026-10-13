import { Readable } from "stream";

/** Một đoạn byte của object, `end` tính cả byte cuối (đúng cú pháp header Range) */
export interface ByteRange {
  start: number;
  end: number;
}

/** Chia [start, total) thành các đoạn liên tiếp, mỗi đoạn tối đa chunkSize byte */
export function splitByteRanges(start: number, total: number, chunkSize: number): ByteRange[] {
  const ranges: ByteRange[] = [];
  for (let from = start; from < total; from += chunkSize) {
    ranges.push({ start: from, end: Math.min(from + chunkSize, total) - 1 });
  }
  return ranges;
}

/** Tổng dung lượng object từ header Content-Range ("bytes 0-99/12345" → 12345) */
export function parseContentRangeTotal(contentRange: string | undefined): number | undefined {
  const total = contentRange?.match(/\/(\d+)$/)?.[1];
  return total === undefined ? undefined : Number(total);
}

/**
 * Tải các đoạn song song nhưng phát ra đúng thứ tự, thành một stream liền mạch.
 * Một kết nối tới R2 qua đường quốc tế chỉ đạt khoảng 1 Mbps, nhiều kết nối cùng lúc cộng dồn được băng thông.
 *
 * - `head`: stream của đoạn đầu (đã mở sẵn để lấy header): phát thẳng, không đệm.
 * - Tối đa `concurrency` kết nối cùng lúc, tính cả `head`; đoạn tải xong trước lượt được giữ trong bộ nhớ
 *   (nhiều nhất `concurrency` × kích thước đoạn).
 * - Stream bị hủy (người nhận ngắt) hoặc một đoạn lỗi: hủy luôn các đoạn đang tải.
 */
export function orderedParallelStream(
  ranges: ByteRange[],
  concurrency: number,
  fetchRange: (range: ByteRange, signal: AbortSignal) => Promise<Uint8Array>,
  head?: Readable,
): Readable {
  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
    head?.destroy();
  };

  async function* run() {
    const pending: Promise<Uint8Array>[] = [];
    let next = 0;
    let headActive = !!head;
    const schedule = () => {
      const limit = Math.max(1, concurrency - (headActive ? 1 : 0));
      while (next < ranges.length && pending.length < limit) {
        const promise = fetchRange(ranges[next++], controller.signal);
        // Lỗi được ném lại khi tới lượt await; chặn unhandled rejection nếu stream bị hủy trước đó
        promise.catch(() => undefined);
        pending.push(promise);
      }
    };

    try {
      schedule();
      if (head) {
        for await (const chunk of head) yield chunk as Buffer;
        headActive = false;
      }
      while (pending.length) {
        schedule();
        const bytes = await pending.shift();
        yield Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      }
    } finally {
      cancel();
    }
  }

  const stream = Readable.from(run(), { objectMode: false });
  // Hủy ngay lúc destroy(): Readable.from chỉ đóng generator (chạy finally) sau khi đoạn đang chờ tải xong
  const destroy = stream._destroy.bind(stream);
  stream._destroy = (error, callback) => {
    cancel();
    destroy(error, callback);
  };
  return stream;
}
