import type { ICacheService } from "@modules/cache/cache.interface";
import { HttpException, HttpStatus } from "@nestjs/common";
import { InvalidPinError } from "./esign.client";

/** Sai PIN quá số lần này thì khóa ký trong PIN_LOCK_SECONDS */
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_SECONDS = 15 * 60;

const keyOf = (userId: string) => `esign:pin-fail:${userId}`;

/**
 * Giới hạn số lần nhập sai PIN theo người dùng (PIN chỉ 6 số nên phải chặn dò).
 * Đếm qua cache dùng chung: không tuyệt đối nguyên tử nhưng đủ chặn dò hàng loạt.
 */
export class PinGuard {
  constructor(
    private readonly cache: ICacheService,
    private readonly userId: string,
  ) {}

  async assertNotLocked() {
    const failures = (await this.cache.get<number>(keyOf(this.userId))) ?? 0;
    if (failures >= MAX_PIN_ATTEMPTS) {
      throw new HttpException(
        { code: "PIN_LOCKED", message: `Too many wrong PIN attempts, try again in ${PIN_LOCK_SECONDS / 60} minutes` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Chạy thao tác cần PIN: sai PIN thì cộng một lần sai (kèm số lần còn lại), đúng thì xóa bộ đếm */
  async run<T>(action: () => Promise<T>): Promise<T> {
    await this.assertNotLocked();
    try {
      const result = await action();
      await this.cache.del(keyOf(this.userId));
      return result;
    } catch (error) {
      if (!(error instanceof InvalidPinError)) throw error;
      const failures = ((await this.cache.get<number>(keyOf(this.userId))) ?? 0) + 1;
      await this.cache.set(keyOf(this.userId), failures, PIN_LOCK_SECONDS);
      throw new HttpException(
        { code: "INVALID_PIN", message: "Invalid PIN", remainingAttempts: Math.max(0, MAX_PIN_ATTEMPTS - failures) },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
