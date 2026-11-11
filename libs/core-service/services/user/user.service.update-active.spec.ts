import { ActivityLogType } from "@core-service/entities/activity-log";
import { DepartmentStatus } from "@core-service/entities/department";
import { describe, expect, it, vi } from "vitest";
import { UserService } from "./user.service";

interface FakeUser {
  id: string;
  authId?: string;
  isActive: boolean;
  lastActiveAt?: Date;
  department: { id: string; name: string; deleted: boolean; status: DepartmentStatus };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function setup(overrides: Partial<FakeUser> = {}) {
  /** Thứ tự các bước có tác dụng phụ — thứ tự là một phần của hợp đồng (ban Supabase trước DB) */
  const calls: string[] = [];
  const user: FakeUser = {
    id: "u1",
    authId: "auth-1",
    isActive: true,
    lastActiveAt: new Date(Date.now() - 40 * DAY_MS),
    department: { id: "d1", name: "Phòng A", deleted: false, status: DepartmentStatus.ACTIVE },
    ...overrides,
  };

  const em = {
    flush: vi.fn(async () => void calls.push("db")),
    getReference: (_: unknown, id: string) => ({ id }),
    getMetadata: () => ({ get: () => ({ tableName: "users" }) }),
  };
  const repo = { findOne: vi.fn(async () => user), getEntityManager: () => em, getEntityName: () => "UserEntity" };
  const supabase = { setBanned: vi.fn(async (_authId: string, banned: boolean) => void calls.push(banned ? "ban" : "unban")) };
  const certificates = { revokeAllForUser: vi.fn(async () => void calls.push("revoke")) };
  const activityLog = { addOne: vi.fn(async () => void calls.push("log")) };
  const cache = { del: vi.fn(async () => undefined), delByPattern: vi.fn(async () => undefined) };

  const service = new UserService(
    repo as never,
    em as never,
    {} as never,
    certificates as never,
    supabase as never,
    {} as never,
    activityLog as never,
  );
  // BaseService nhận request và cache bằng property injection
  Object.assign(service, { cache, request: { user: { id: "actor" } } });

  return { service, user, calls, supabase, certificates, activityLog };
}

type LogCall = [{ type: ActivityLogType; newData: Record<string, unknown> }];

describe("UserService.updateActive", () => {
  it("khóa: ban Supabase trước, rồi ghi DB, thu hồi chữ ký số, ghi log", async () => {
    const { service, user, calls, supabase, certificates } = setup();

    await service.updateActive("u1", false);

    expect(supabase.setBanned).toHaveBeenCalledWith("auth-1", true);
    expect(user.isActive).toBe(false);
    expect(certificates.revokeAllForUser).toHaveBeenCalledWith("u1", "User deactivated");
    expect(calls.indexOf("ban")).toBeLessThan(calls.indexOf("db"));
    expect(calls.indexOf("db")).toBeLessThan(calls.indexOf("revoke"));
  });

  it("ban Supabase lỗi: chưa đổi gì (isActive, chữ ký số, log) để cron thử lại lần sau", async () => {
    const { service, user, calls, supabase, certificates, activityLog } = setup();
    supabase.setBanned.mockRejectedValueOnce(new Error("supabase down"));

    await expect(service.updateActive("u1", false, { reason: "inactivity" })).rejects.toThrow("supabase down");

    expect(user.isActive).toBe(true);
    expect(calls).toEqual([]);
    expect(certificates.revokeAllForUser).not.toHaveBeenCalled();
    expect(activityLog.addOne).not.toHaveBeenCalled();
  });

  it("khóa tự động: log kiểu System kèm reason, ghi chú thu hồi nêu lý do không hoạt động", async () => {
    const { service, certificates, activityLog } = setup();

    await service.updateActive("u1", false, { reason: "inactivity" });

    expect(certificates.revokeAllForUser).toHaveBeenCalledWith("u1", "Locked: inactivity");
    const [log] = activityLog.addOne.mock.calls[0] as unknown as LogCall;
    expect(log.type).toBe(ActivityLogType.System);
    expect(log.newData).toMatchObject({ reason: "inactivity", isActive: false });
  });

  it("khóa tay: log kiểu User, không có reason", async () => {
    const { service, activityLog } = setup();

    await service.updateActive("u1", false);

    const [log] = activityLog.addOne.mock.calls[0] as unknown as LogCall;
    expect(log.type).toBe(ActivityLogType.User);
    expect(log.newData).not.toHaveProperty("reason");
  });

  it("user vừa hoạt động sau mốc ifInactiveSince: bỏ qua, không ban, không đổi gì", async () => {
    const { service, user, calls, supabase } = setup({ lastActiveAt: new Date() });

    const result = await service.updateActive("u1", false, { reason: "inactivity", ifInactiveSince: new Date(Date.now() - 30 * DAY_MS) });

    expect(result).toBeNull();
    expect(supabase.setBanned).not.toHaveBeenCalled();
    expect(user.isActive).toBe(true);
    expect(calls).toEqual([]);
  });

  it("user chưa từng có lastActiveAt vẫn bị khóa khi có ifInactiveSince", async () => {
    const { service, user, supabase } = setup({ lastActiveAt: undefined });

    await service.updateActive("u1", false, { reason: "inactivity", ifInactiveSince: new Date() });

    expect(supabase.setBanned).toHaveBeenCalledWith("auth-1", true);
    expect(user.isActive).toBe(false);
  });

  it("mở khóa: gỡ ban trước DB, đặt lại lastActiveAt = bây giờ, không thu hồi chữ ký số", async () => {
    const { service, user, calls, supabase, certificates } = setup({ isActive: false, lastActiveAt: new Date(Date.now() - 400 * DAY_MS) });
    const before = Date.now();

    await service.updateActive("u1", true);

    expect(supabase.setBanned).toHaveBeenCalledWith("auth-1", false);
    expect(user.isActive).toBe(true);
    expect(user.lastActiveAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(certificates.revokeAllForUser).not.toHaveBeenCalled();
    expect(calls.indexOf("unban")).toBeLessThan(calls.indexOf("db"));
  });

  it("gỡ ban lỗi: user vẫn bị khóa (isActive=false) để admin thử lại", async () => {
    const { service, user, supabase } = setup({ isActive: false });
    supabase.setBanned.mockRejectedValueOnce(new Error("supabase down"));

    await expect(service.updateActive("u1", true)).rejects.toThrow("supabase down");

    expect(user.isActive).toBe(false);
  });

  it("user không có authId (system user): không gọi Supabase", async () => {
    const { service, user, supabase } = setup({ authId: undefined });

    await service.updateActive("u1", false);

    expect(supabase.setBanned).not.toHaveBeenCalled();
    expect(user.isActive).toBe(false);
  });

  it("trạng thái không đổi thì từ chối", async () => {
    const { service, supabase } = setup({ isActive: false });

    await expect(service.updateActive("u1", false)).rejects.toThrow("already inactive");
    expect(supabase.setBanned).not.toHaveBeenCalled();
  });
});
