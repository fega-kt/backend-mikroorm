import "reflect-metadata";
import { ApprovalEventType } from "@app-domain/services/approval-engine/approval-events";
import { ActivityLogQueueStatus } from "@core-service/entities/activity-log-queue";
import { NotificationType } from "@core-service/entities/notification";
import { describe, expect, it, vi } from "vitest";
import { ApprovalEmailConsumer } from "./approval-email.consumer";

/** Hàng đợi giả: lưu trạng thái từng dòng trong bộ nhớ */
function fakeQueue() {
  const rows = new Map<string, Record<string, unknown>>();
  let seq = 0;
  const patch = (id: string, values: Record<string, unknown>) => rows.set(id, { ...rows.get(id), ...values });
  return {
    rows,
    create: vi.fn(async (data: { userId: string; type: NotificationType; refId?: string; eventId?: string }) => {
      const id = `q${++seq}`;
      rows.set(id, { ...data, id, status: ActivityLogQueueStatus.DRAFT, attempts: 0 });
      return { id, userId: data.userId };
    }),
    findOne: vi.fn(async (id: string) => rows.get(id)),
    findByEvent: vi.fn(async (eventId: string) => [...rows.values()].filter((row) => row.eventId === eventId)),
    update: vi.fn(async (id: string, values: Record<string, unknown>) => patch(id, values)),
    markCompleted: vi.fn(async (id: string, values: Record<string, unknown> = {}) =>
      patch(id, { ...values, status: ActivityLogQueueStatus.COMPLETED }),
    ),
    markFailed: vi.fn(async (id: string, error: string, attempts: number) =>
      patch(id, { status: ActivityLogQueueStatus.FAILED, error, attempts }),
    ),
    markSkipped: vi.fn(async (id: string, error: string, values: Record<string, unknown> = {}) =>
      patch(id, { ...values, status: ActivityLogQueueStatus.SKIPPED, error }),
    ),
  };
}

const users = {
  a: { id: "a", fullName: "An", workEmail: "an@corp.vn", loginName: "an" },
  b: { id: "b", fullName: "Bình", workEmail: null, loginName: "binh" },
  c: { id: "c", fullName: "Chi", workEmail: "chi@corp.vn", loginName: "chi" },
};

function setup(send: (to: string) => { error: { name: string; message: string } | null }) {
  const queue = fakeQueue();
  const consumer = new ApprovalEmailConsumer({} as never, {} as never, queue as never);
  const internals = consumer as unknown as Record<string, unknown>;
  internals.retryDelaysMs = [0, 0];
  internals.resend = { emails: { send: vi.fn(async ({ to }: { to: string }) => send(to)) } };
  internals.buildContext = vi.fn(async () => ({
    template: { subject: "Tờ trình {{request.code}}", body: "<p>{{recipient.name}}</p>" },
    vars: { "request.code": "TT-1" },
    users: new Map(Object.values(users).map((user) => [user.id, user])),
  }));
  const handle = (body: object) =>
    new Promise<"ack" | "nack">((resolve) => {
      void (internals.handle as (...args: unknown[]) => Promise<void>).call(
        consumer,
        { content: Buffer.from(JSON.stringify(body)) },
        () => resolve("ack"),
        () => resolve("nack"),
      );
    });
  return { queue, handle, send: (internals.resend as { emails: { send: ReturnType<typeof vi.fn> } }).emails.send };
}

const event = { type: ApprovalEventType.Rejected, requestId: "r1", title: "T", requesterId: "a", occurredAt: "" };

describe("ApprovalEmailConsumer", () => {
  it("logs one queue row per recipient: sent, skipped without email, retried transient errors", async () => {
    let calls = 0;
    const { queue, handle } = setup((to) => {
      if (to === "chi@corp.vn" && ++calls === 1) return { error: { name: "rate_limit_exceeded", message: "Too many requests" } };
      return { error: null };
    });

    expect(await handle({ ...event, recipientIds: ["a", "b", "c"] })).toBe("ack");
    const rows = [...queue.rows.values()];
    expect(rows.map((row) => row.type)).toEqual([
      NotificationType.APPROVAL_REJECTED,
      NotificationType.APPROVAL_REJECTED,
      NotificationType.APPROVAL_REJECTED,
    ]);
    expect(rows.every((row) => row.refId === "r1")).toBe(true);
    expect(rows[0]).toMatchObject({
      status: ActivityLogQueueStatus.COMPLETED,
      attempts: 1,
      recipient: "an@corp.vn",
      subject: "Tờ trình TT-1",
    });
    expect(rows[1]).toMatchObject({ status: ActivityLogQueueStatus.SKIPPED, error: "Recipient has no email address" });
    expect(rows[2]).toMatchObject({ status: ActivityLogQueueStatus.COMPLETED, attempts: 2 });
  });

  it("does not retry permanent errors and resends a single row by queueId", async () => {
    let fail = true;
    const { queue, handle } = setup(() =>
      fail ? { error: { name: "validation_error", message: "Invalid `to` field" } } : { error: null },
    );

    await handle({ ...event, recipientIds: ["a"] });
    const [row] = [...queue.rows.values()];
    expect(row).toMatchObject({ status: ActivityLogQueueStatus.FAILED, attempts: 1, error: "Invalid `to` field" });

    // "Gửi lại" từ màn hàng đợi: message mang queueId + userId, không tạo dòng mới, cộng dồn số lần thử
    fail = false;
    await handle({ ...event, recipientIds: ["a"], queueId: row.id, userId: "a" });
    expect(queue.rows.size).toBe(1);
    expect(queue.rows.get(row.id as string)).toMatchObject({ status: ActivityLogQueueStatus.COMPLETED, attempts: 2 });
  });
  it("skips recipients already handled for the same outbox event (at-least-once delivery)", async () => {
    const { queue, handle, send } = setup(() => ({ error: null }));
    const message = { ...event, eventId: "evt-1", recipientIds: ["a", "c"] };

    await handle(message);
    await handle(message);
    expect(queue.rows.size).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
