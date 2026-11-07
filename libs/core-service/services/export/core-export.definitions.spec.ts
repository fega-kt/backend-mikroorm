import { PermissionType } from "@common/base/permission-type.enum";
import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { userListFilterValidation } from "../../controllers/user/user.validation";
import { DepartmentStatus } from "../../entities/department";
import { buildActivityLogQueueWhere } from "../activity-log-queue/activity-log-queue-filter";
import { buildUserListWhere } from "../user/user-list-filter";
import {
  ACTIVITY_LOG_EXPORT_COLUMNS,
  CORE_EXPORT_DEFINITIONS,
  DEPARTMENT_EXPORT_COLUMNS,
  ROLE_EXPORT_COLUMNS,
  USER_EXPORT_COLUMNS,
} from "./core-export.definitions";
import type { ExportUser } from "./export.types";

const definitionOf = (resource: string) => {
  const definition = CORE_EXPORT_DEFINITIONS.find((item) => item.resource === resource);
  if (!definition) throw new Error(resource);
  return definition;
};

const user = (permissions: PermissionType[], departmentId?: string): ExportUser => ({
  id: "u1",
  department: departmentId ? { id: departmentId } : null,
  canAccess: (required) => required.some((permission) => permissions.includes(permission)),
});

/** em giả: ghi lại điều kiện count / find; find trả các hàng cho trước theo khóa id như truy vấn thật */
function fakeEm(rows: { id: string }[] = [], departments: Record<string, unknown>[] = []) {
  const em = {
    count: vi.fn(async (_entity?: unknown, _where?: unknown) => rows.length),
    clear: vi.fn(),
    find: vi.fn(
      async (entity: { name?: string }, where: { $and?: { id?: { $gt: string } }[] }, options?: { limit: number; fields?: string[] }) => {
        if (entity?.name === "DepartmentEntity" && !options) return departments;
        if (!options) return [];
        const after = where?.$and?.find((part) => part.id)?.id?.$gt ?? null;
        return rows.filter((row) => !after || row.id > after).slice(0, options.limit);
      },
    ),
    findOne: vi.fn(async () => null),
  };
  return em;
}

const cutoff = new Date("2026-11-05T00:00:00Z");

describe("export parity with the list filters", () => {
  it("users: counts with exactly the list condition plus the cutoff", async () => {
    const em = fakeEm([{ id: "a" }]);
    const rawFilter = { keyword: "an", isActive: "true", page: "2" };
    const scope = await definitionOf("user").open(em as never, rawFilter, "u1", cutoff);
    await scope.count();
    expect(em.count).toHaveBeenCalledWith(expect.anything(), {
      $and: [buildUserListWhere(userListFilterValidation.parse(rawFilter)), { createdAt: { $lte: cutoff } }],
    });
  });

  it("email queue: the same condition builder as the list", async () => {
    const em = fakeEm([{ id: "a" }]);
    const scope = await definitionOf("activity-log-queue").open(em as never, { status: "failed", keyword: "50%" }, "u1", cutoff);
    await scope.count();
    expect(em.count).toHaveBeenCalledWith(expect.anything(), {
      $and: [buildActivityLogQueueWhere({ status: "failed" as never, keyword: "50%" }), { createdAt: { $lte: cutoff } }],
    });
  });

  it("reads batches by id and never selects sensitive or heavy columns", async () => {
    const em = fakeEm([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const users = await definitionOf("user").open(em as never, {}, "u1", cutoff);
    await users.fetch(null, 2);
    await users.fetch("b", 2);
    const userFields = em.find.mock.calls[0][2]?.fields ?? [];
    expect(userFields).not.toEqual(expect.arrayContaining(["groups"]));
    expect(userFields.join(" ")).not.toMatch(/password|token|principal|groups/i);
    expect(JSON.stringify(em.find.mock.calls[1][1])).toContain('"id":{"$gt":"b"}');

    const logs = await definitionOf("activity-log").open(em as never, {}, "u1", cutoff, { all: true });
    await logs.fetch(null, 10);
    const logFields = em.find.mock.calls.at(-1)?.[2]?.fields ?? [];
    expect(logFields).not.toEqual(expect.arrayContaining(["oldData"]));
    expect(logFields).not.toEqual(expect.arrayContaining(["newData"]));
  });
});

describe("activity log scope", () => {
  const definition = definitionOf("activity-log");

  it("is frozen at prepare: all system, or the viewer's own department", () => {
    expect(
      definition.resolveScope?.(user([PermissionType.ViewActivityLogAll, PermissionType.ViewActivityLogDepartment], "d1"), {}),
    ).toEqual({
      all: true,
      departmentId: "d1",
    });
    expect(definition.resolveScope?.(user([PermissionType.ViewActivityLogDepartment], "d1"), {})).toEqual({
      all: false,
      departmentId: "d1",
    });
  });

  it("refuses someone who may view neither the whole log nor a department's", () => {
    expect(() => definition.resolveScope?.(user([PermissionType.ExportActivityLog], "d1"), {})).toThrow(ForbiddenException);
  });

  it("shows nothing to a department viewer without a department, and does not limit a viewer of everything", async () => {
    const none = await definition.open(fakeEm() as never, {}, "u1", cutoff, { all: false, departmentId: null });
    expect(await none.count()).toBe(0);
    expect(await none.fetch(null, 10)).toEqual([]);

    const em = fakeEm([{ id: "a" }]);
    const everything = await definition.open(em as never, {}, "u1", cutoff, { all: true });
    await everything.count();
    // Không có điều kiện phòng ban: chỉ chưa xóa + chặn thời điểm
    expect(JSON.stringify(em.count.mock.calls[0][1])).not.toContain("department");
  });

  it("limits a department viewer to that department's tree", async () => {
    const em = fakeEm([{ id: "a" }]);
    em.findOne.mockResolvedValue({ id: "d1", code: "it", parentCode: null });
    const scope = await definition.open(em as never, {}, "u1", cutoff, { all: false, departmentId: "d1" });
    await scope.count();
    expect(JSON.stringify(em.count.mock.calls[0][1])).toContain("department");
  });
});

describe("column values", () => {
  const value = <T>(
    columns: { key: string; value: (row: T, lang: "vi-VN" | "en-US" | "zh-CN") => unknown }[],
    key: string,
    row: T,
    lang: "vi-VN" | "en-US" | "zh-CN" = "vi-VN",
  ) => columns.find((column) => column.key === key).value(row, lang);

  it("translates active / inactive for users and departments", () => {
    const row = { id: "1", fullName: "An", loginName: "an@x.vn", isActive: false, createdAt: cutoff, updatedAt: cutoff };
    expect(value(USER_EXPORT_COLUMNS, "status", row)).toBe("Ngừng hoạt động");
    expect(value(USER_EXPORT_COLUMNS, "status", { ...row, isActive: true }, "en-US")).toBe("Active");
    const department = { id: "1", code: "it", name: "IT", status: DepartmentStatus.ACTIVE, createdAt: cutoff, updatedAt: cutoff };
    expect(value(DEPARTMENT_EXPORT_COLUMNS, "status", department, "zh-CN")).toBe("启用");
  });

  it("exports the number of permissions of a role, not the permissions themselves", () => {
    const columnKeys = ROLE_EXPORT_COLUMNS.map((column) => column.key);
    expect(columnKeys).toContain("rightsCount");
    expect(columnKeys).not.toContain("rights");
  });

  it("does not export the changed data of a log entry", () => {
    const keys = ACTIVITY_LOG_EXPORT_COLUMNS.map((column) => column.key);
    expect(keys).not.toContain("oldData");
    expect(keys).not.toContain("newData");
  });
});
