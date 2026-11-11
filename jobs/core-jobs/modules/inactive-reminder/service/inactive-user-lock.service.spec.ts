import { AppSettingType } from "@core-service/entities/app-setting";
import { NotificationType } from "@core-service/entities/notification";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { describe, expect, it, vi } from "vitest";
import { InactiveUserLockService } from "./inactive-user-lock.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

interface FakeUser {
  id: string;
  authId: string;
  createdAt: Date;
  lastActiveAt?: Date;
}

const user = (id: string, lastActiveDaysAgo?: number, createdDaysAgo = 400): FakeUser => ({
  id,
  authId: `auth-${id}`,
  createdAt: daysAgo(createdDaysAgo),
  lastActiveAt: lastActiveDaysAgo === undefined ? undefined : daysAgo(lastActiveDaysAgo),
});

interface Options {
  /** Giá trị setting theo key; thiếu key = chưa cấu hình */
  settings?: Partial<Record<AppSettingType, unknown>>;
  /** Các lô trả về lần lượt; hết lô thì trả rỗng */
  batches?: FakeUser[][];
  /** updateActive cho từng user: mặc định khóa được */
  updateActive?: (id: string) => Promise<unknown>;
  /** Hàm backfill: nhận lô, có thể gán lastActiveAt */
  backfill?: (users: FakeUser[]) => Promise<void>;
  rabbitConnected?: boolean;
}

function setup({ settings = {}, batches = [], updateActive, backfill, rabbitConnected = true }: Options = {}) {
  const queue = [...batches];
  const em = {
    findOne: vi.fn(async (_entity: unknown, where: { key: AppSettingType }) =>
      where.key in settings ? { value: settings[where.key] } : null,
    ),
    find: vi.fn(async () => queue.shift() ?? []),
  };
  // RequestContext.create cần em có name và fork()
  const orm = { em: { name: "default", fork: () => em } };

  const userService = { updateActive: vi.fn(updateActive ?? (async () => ({}))) };
  const moduleRef = {
    registerRequestByContextId: vi.fn(),
    resolve: vi.fn(async () => userService),
  };
  const rabbitmq = { isConnected: rabbitConnected, publish: vi.fn(async () => undefined) };
  const queueService = { create: vi.fn(async (data: { userId: string }) => ({ id: `queue-${data.userId}` })) };
  const lastActiveBackfill = { backfill: vi.fn(backfill ?? (async () => undefined)) };

  const service = new InactiveUserLockService(
    orm as never,
    moduleRef as never,
    rabbitmq as never,
    queueService as never,
    lastActiveBackfill as never,
  );
  return { service, em, userService, moduleRef, rabbitmq, queueService, lastActiveBackfill };
}

const lockSettings = (lockDays: unknown, threshold?: unknown) => ({
  [AppSettingType.INACTIVE_LOCK_DAYS]: lockDays,
  ...(threshold !== undefined && { [AppSettingType.INACTIVE_DAYS_THRESHOLD]: threshold }),
});

describe("InactiveUserLockService", () => {
  it("INACTIVE_LOCK_DAYS chưa cấu hình hoặc 0: tắt, không quét user nào", async () => {
    for (const settings of [{}, lockSettings(0), lockSettings("abc")]) {
      const { service, em } = setup({ settings, batches: [[user("a", 100)]] });

      await service.lockInactiveUsers();

      expect(em.find).not.toHaveBeenCalled();
    }
  });

  it("ngưỡng khóa không lớn hơn ngưỡng nhắc (mặc định 7 ngày): bỏ qua", async () => {
    const equal = setup({ settings: lockSettings(7), batches: [[user("a", 100)]] });
    await equal.service.lockInactiveUsers();
    expect(equal.em.find).not.toHaveBeenCalled();

    const custom = setup({ settings: lockSettings(20, 30), batches: [[user("a", 100)]] });
    await custom.service.lockInactiveUsers();
    expect(custom.em.find).not.toHaveBeenCalled();
  });

  it("khóa user quá hạn bằng UserService.updateActive với lý do không hoạt động và mốc cutoff", async () => {
    const { service, userService, moduleRef } = setup({ settings: lockSettings(30), batches: [[user("a", 45)]] });
    const before = Date.now();

    await service.lockInactiveUsers();

    expect(userService.updateActive).toHaveBeenCalledTimes(1);
    const [id, active, options] = userService.updateActive.mock.calls[0] as unknown as [
      string,
      boolean,
      { reason: string; ifInactiveSince: Date },
    ];
    expect([id, active, options.reason]).toEqual(["a", false, "inactivity"]);
    // cutoff = bây giờ - 30 ngày
    expect(Math.abs(options.ifInactiveSince.getTime() - (before - 30 * DAY_MS))).toBeLessThan(5_000);
    // request hệ thống được đăng ký cho context của lần resolve
    expect(moduleRef.registerRequestByContextId).toHaveBeenCalledTimes(1);
  });

  it("user chưa có lastActiveAt thì tính từ createdAt, và dùng mốc backfill nếu có", async () => {
    const neverActive = user("never", undefined, 100); // chưa từng online, tạo 100 ngày trước → khóa
    const backfilledRecent = user("recent", undefined, 100); // backfill ra mốc 2 ngày trước → không khóa
    const { service, userService } = setup({
      settings: lockSettings(30),
      batches: [[neverActive, backfilledRecent]],
      backfill: async (users) => {
        const target = users.find((u) => u.id === "recent");
        if (target) target.lastActiveAt = daysAgo(2);
      },
    });

    await service.lockInactiveUsers();

    expect(userService.updateActive.mock.calls.map((call) => call[0])).toEqual(["never"]);
  });

  it("đẩy mail báo khóa cho user đã khóa (số ngày không hoạt động), không đẩy cho user bị bỏ qua", async () => {
    const { service, rabbitmq, queueService } = setup({
      settings: lockSettings(30),
      batches: [[user("locked", 45), user("skipped", 50)]],
      updateActive: async (id) => (id === "skipped" ? null : {}),
    });

    await service.lockInactiveUsers();

    expect(queueService.create).toHaveBeenCalledTimes(1);
    expect(queueService.create).toHaveBeenCalledWith({ userId: "locked", type: NotificationType.ACCOUNT_LOCKED, payload: { days: 45 } });
    expect(rabbitmq.publish).toHaveBeenCalledWith(RABBITMQ_EXCHANGE.NOTIFICATION, RABBITMQ_QUEUES.NOTIFICATION_EMAIL_ACCOUNT_LOCKED, {
      days: 45,
      queueId: "queue-locked",
      userId: "locked",
    });
  });

  it("một user lỗi không làm hỏng cả lô và không có mail cho user lỗi", async () => {
    const { service, userService, rabbitmq } = setup({
      settings: lockSettings(30),
      batches: [[user("bad", 60), user("good", 60)]],
      updateActive: async (id) => {
        if (id === "bad") throw new Error("supabase down");
        return {};
      },
    });

    await expect(service.lockInactiveUsers()).resolves.toBeUndefined();

    expect(userService.updateActive).toHaveBeenCalledTimes(2);
    expect(rabbitmq.publish).toHaveBeenCalledTimes(1);
    expect((rabbitmq.publish.mock.calls[0] as unknown[])[2]).toMatchObject({ userId: "good" });
  });

  it("RabbitMQ rớt: vẫn khóa và tạo dòng queue (để gửi lại), không publish", async () => {
    const { service, userService, queueService, rabbitmq } = setup({
      settings: lockSettings(30),
      batches: [[user("a", 60)]],
      rabbitConnected: false,
    });

    await service.lockInactiveUsers();

    expect(userService.updateActive).toHaveBeenCalledTimes(1);
    expect(queueService.create).toHaveBeenCalledTimes(1);
    expect(rabbitmq.publish).not.toHaveBeenCalled();
  });

  it("lỗi tạo dòng queue không làm user đã khóa bị tính là thất bại và không dừng cron", async () => {
    const { service, queueService } = setup({ settings: lockSettings(30), batches: [[user("a", 60), user("b", 60)]] });
    queueService.create.mockRejectedValueOnce(new Error("db down"));

    await expect(service.lockInactiveUsers()).resolves.toBeUndefined();

    expect(queueService.create).toHaveBeenCalledTimes(2);
  });

  it("duyệt nhiều lô theo keyset id: lô sau lọc id lớn hơn id cuối của lô trước, dừng khi hết lô", async () => {
    const { service, em, userService } = setup({
      settings: lockSettings(30),
      batches: [[user("a", 60), user("b", 60)], [user("c", 60)]],
    });

    await service.lockInactiveUsers();

    expect(em.find).toHaveBeenCalledTimes(3);
    const wheres = em.find.mock.calls.map((call) => (call as unknown[])[1] as { id?: { $gt: string } });
    expect(wheres[0].id).toBeUndefined();
    expect(wheres[1].id).toEqual({ $gt: "b" });
    expect(wheres[2].id).toEqual({ $gt: "c" });
    expect(userService.updateActive).toHaveBeenCalledTimes(3);
  });

  it("chỉ quét user đang hoạt động, chưa xóa và có authId", async () => {
    const { service, em } = setup({ settings: lockSettings(30), batches: [[]] });

    await service.lockInactiveUsers();

    const where = (em.find.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(where).toMatchObject({ isActive: true, deleted: { $ne: true }, authId: { $ne: null } });
  });

  it("khóa song song nhưng không vượt 5 user cùng lúc", async () => {
    let running = 0;
    let peak = 0;
    const { service } = setup({
      settings: lockSettings(30),
      batches: [Array.from({ length: 20 }, (_, i) => user(`u${i}`, 60))],
      updateActive: async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        return {};
      },
    });

    await service.lockInactiveUsers();

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });
});
