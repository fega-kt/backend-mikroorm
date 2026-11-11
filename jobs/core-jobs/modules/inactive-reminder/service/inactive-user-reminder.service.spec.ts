import { AppSettingType } from "@core-service/entities/app-setting";
import { NotificationType } from "@core-service/entities/notification";
import { RABBITMQ_EXCHANGE, RABBITMQ_QUEUES } from "@modules/rabbitmq/rabbitmq.constants";
import { describe, expect, it, vi } from "vitest";
import { InactiveUserReminderService } from "./inactive-user-reminder.service";

const DAY_MS = 24 * 60 * 60 * 1000;
// Lùi thêm 1 giờ để số ngày luôn nằm trong ngày đó, không sát ranh giới khi test chạy
const inactiveFor = (days: number) => new Date(Date.now() - days * DAY_MS - 60 * 60 * 1000);

const user = (id: string, days: number) => ({
  id,
  fullName: `User ${id}`,
  createdAt: inactiveFor(400),
  authId: `auth-${id}`,
  lastActiveAt: inactiveFor(days),
});

function setup(settings: Partial<Record<AppSettingType, unknown>>, users: ReturnType<typeof user>[]) {
  const em = {
    findOne: vi.fn(async (_entity: unknown, where: { key: AppSettingType }) =>
      where.key in settings ? { value: settings[where.key] } : null,
    ),
    find: vi.fn(async () => users),
    nativeUpdate: vi.fn(async () => 0),
    create: vi.fn(),
    getReference: vi.fn((_entity: unknown, id: string) => ({ id })),
    flush: vi.fn(async () => undefined),
  };
  const orm = { em: { fork: () => em } };
  const rabbitmq = { isConnected: true, publish: vi.fn(async () => undefined) };
  const queueService = { create: vi.fn(async (data: { userId: string }) => ({ id: `queue-${data.userId}` })) };
  const backfill = { backfill: vi.fn(async () => undefined) };

  const service = new InactiveUserReminderService(orm as never, rabbitmq as never, queueService as never, backfill as never);
  return { service, em, rabbitmq, queueService };
}

const publishedMessages = (rabbitmq: { publish: ReturnType<typeof vi.fn> }) =>
  rabbitmq.publish.mock.calls.map((call) => (call as unknown[])[2] as { userId: string; days: number; daysLeft?: number });

describe("InactiveUserReminderService.sendInactiveReminders", () => {
  it("tự khóa tắt: nhắc mọi user từ ngưỡng nhắc trở lên, không có daysLeft", async () => {
    const { service, rabbitmq } = setup({ [AppSettingType.INACTIVE_DAYS_THRESHOLD]: 7 }, [user("fresh", 3), user("a", 10), user("b", 200)]);

    await service.sendInactiveReminders();

    expect(publishedMessages(rabbitmq).map((m) => [m.userId, m.days, m.daysLeft])).toEqual([
      ["a", 10, undefined],
      ["b", 200, undefined],
    ]);
  });

  it("tự khóa bật: kèm daysLeft = số ngày còn lại tới lúc khóa", async () => {
    const { service, rabbitmq, queueService } = setup(
      { [AppSettingType.INACTIVE_DAYS_THRESHOLD]: 7, [AppSettingType.INACTIVE_LOCK_DAYS]: 30 },
      [user("a", 10), user("b", 29)],
    );

    await service.sendInactiveReminders();

    expect(publishedMessages(rabbitmq).map((m) => [m.userId, m.days, m.daysLeft])).toEqual([
      ["a", 10, 20],
      ["b", 29, 1],
    ]);
    expect(queueService.create).toHaveBeenCalledWith({
      userId: "b",
      type: NotificationType.LOGIN_INACTIVE_REMINDER,
      payload: { days: 29, daysLeft: 1 },
    });
  });

  it("tự khóa bật: user đã tới hạn khóa (số ngày ≥ lockDays) không được nhắc, không có mail thiếu số ngày", async () => {
    const { service, rabbitmq, queueService, em } = setup(
      { [AppSettingType.INACTIVE_DAYS_THRESHOLD]: 7, [AppSettingType.INACTIVE_LOCK_DAYS]: 30 },
      [user("due", 30), user("long", 90), user("ok", 12)],
    );

    await service.sendInactiveReminders();

    expect(publishedMessages(rabbitmq).map((m) => m.userId)).toEqual(["ok"]);
    expect(queueService.create).toHaveBeenCalledTimes(1);
    // noti in-app cũng chỉ cho người được nhắc
    expect(em.create).toHaveBeenCalledTimes(1);
    for (const message of publishedMessages(rabbitmq)) expect(message.daysLeft).toBeGreaterThanOrEqual(1);
  });

  it("INACTIVE_LOCK_DAYS không lớn hơn ngưỡng nhắc: coi như tắt, nhắc như bình thường", async () => {
    const { service, rabbitmq } = setup({ [AppSettingType.INACTIVE_DAYS_THRESHOLD]: 7, [AppSettingType.INACTIVE_LOCK_DAYS]: 7 }, [
      user("a", 10),
    ]);

    await service.sendInactiveReminders();

    expect(publishedMessages(rabbitmq).map((m) => [m.userId, m.daysLeft])).toEqual([["a", undefined]]);
  });

  it("gửi tới đúng queue nhắc đăng nhập", async () => {
    const { service, rabbitmq } = setup({}, [user("a", 10)]);

    await service.sendInactiveReminders();

    expect(rabbitmq.publish).toHaveBeenCalledWith(
      RABBITMQ_EXCHANGE.NOTIFICATION,
      RABBITMQ_QUEUES.NOTIFICATION_EMAIL_INACTIVE_REMINDER,
      expect.objectContaining({ userId: "a", queueId: "queue-a" }),
    );
  });
});
