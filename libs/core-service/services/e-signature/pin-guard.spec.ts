import type { ICacheService } from "@modules/cache/cache.interface";
import { type HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { InvalidPinError } from "./esign.client";
import { MAX_PIN_ATTEMPTS, PinGuard } from "./pin-guard";

const memoryCache = (): ICacheService => {
  const store = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => (store.get(key) as T) ?? null,
    set: async (key: string, value: unknown) => void store.set(key, value),
    del: async (...keys: string[]) => keys.forEach((key) => store.delete(key)),
    delByPattern: async () => undefined,
  };
};

const wrongPin = () => Promise.reject(new InvalidPinError());
const responseOf = (error: unknown) => (error as HttpException).getResponse() as Record<string, unknown>;

describe("PinGuard", () => {
  it("counts wrong PINs and locks after the limit", async () => {
    const guard = new PinGuard(memoryCache(), "u1");
    for (let i = 1; i <= MAX_PIN_ATTEMPTS; i++) {
      const error = await guard.run(wrongPin).catch((e: unknown) => e);
      expect(responseOf(error)).toMatchObject({ code: "INVALID_PIN", remainingAttempts: MAX_PIN_ATTEMPTS - i });
    }
    const locked = await guard.run(async () => "ok").catch((e: unknown) => e);
    expect(responseOf(locked)).toMatchObject({ code: "PIN_LOCKED" });
  });

  it("resets the counter after a correct PIN and keeps users separate", async () => {
    const cache = memoryCache();
    const guard = new PinGuard(cache, "u1");
    await guard.run(wrongPin).catch(() => undefined);
    await expect(guard.run(async () => "ok")).resolves.toBe("ok");
    const error = await guard.run(wrongPin).catch((e: unknown) => e);
    expect(responseOf(error).remainingAttempts).toBe(MAX_PIN_ATTEMPTS - 1);

    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await new PinGuard(cache, "u2").run(wrongPin).catch(() => undefined);
    await expect(guard.run(async () => "ok")).resolves.toBe("ok");
  });

  it("passes other errors through without counting", async () => {
    const guard = new PinGuard(memoryCache(), "u1");
    await expect(guard.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    const error = await guard.run(wrongPin).catch((e: unknown) => e);
    expect(responseOf(error).remainingAttempts).toBe(MAX_PIN_ATTEMPTS - 1);
  });
});
