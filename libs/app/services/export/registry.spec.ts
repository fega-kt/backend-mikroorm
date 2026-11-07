import { PermissionType } from "@common/base/permission-type.enum";
import { CORE_EXPORT_DEFINITIONS } from "@core-service/services/export/core-export.definitions";
import { createExportRegistry } from "@core-service/services/export/export.registry";
import { EXPORT_LANGS } from "@core-service/services/export/export.util";
import { describe, expect, it } from "vitest";
import { APP_EXPORT_DEFINITIONS } from "./app-export.definitions";

const CORE_RESOURCES = ["user", "department", "group", "role", "activity-log", "activity-log-queue"];
const APP_RESOURCES = ["approval-request-mine", "approval-request-all", "approval-inbox", "approval-delegation"];

describe("export registries", () => {
  const core = createExportRegistry(CORE_EXPORT_DEFINITIONS);
  const app = createExportRegistry(APP_EXPORT_DEFINITIONS);

  it("core knows only the core lists and app only the approval lists, with no overlap (each worker runs its own)", () => {
    expect([...core.resources()].sort()).toEqual([...CORE_RESOURCES].sort());
    expect([...app.resources()].sort()).toEqual([...APP_RESOURCES].sort());
    expect(core.resources().filter((resource) => app.resources().includes(resource))).toEqual([]);
  });

  it("returns undefined for a resource the registry does not know (the other host's list)", () => {
    expect(core.get("approval-inbox")).toBeUndefined();
    expect(app.get("user")).toBeUndefined();
    expect(core.get("nope")).toBeUndefined();
  });

  it("refuses a duplicate resource key", () => {
    expect(() => createExportRegistry([...CORE_EXPORT_DEFINITIONS, CORE_EXPORT_DEFINITIONS[0]])).toThrow(/Duplicate/);
  });

  it("gives every definition unique column keys, headers and titles in all languages", () => {
    for (const definition of [...CORE_EXPORT_DEFINITIONS, ...APP_EXPORT_DEFINITIONS]) {
      expect(new Set(definition.columns.map((column) => column.key)).size, definition.resource).toBe(definition.columns.length);
      for (const lang of EXPORT_LANGS) {
        expect(definition.title[lang].length).toBeGreaterThan(0);
        for (const column of definition.columns) expect(column.header[lang].length).toBeGreaterThan(0);
      }
    }
  });

  it("gives each core list its own export permission and every approval list the one shared approval permission", () => {
    const permissionOf = (resource: string) =>
      [...CORE_EXPORT_DEFINITIONS, ...APP_EXPORT_DEFINITIONS]
        .find((definition) => definition.resource === resource)
        ?.permissions.filter((p) => p.endsWith(":export"));
    expect(permissionOf("user")).toEqual([PermissionType.ExportUser]);
    expect(permissionOf("department")).toEqual([PermissionType.ExportDepartment]);
    expect(permissionOf("group")).toEqual([PermissionType.ExportGroup]);
    expect(permissionOf("role")).toEqual([PermissionType.ExportRole]);
    expect(permissionOf("activity-log")).toEqual([PermissionType.ExportActivityLog]);
    expect(permissionOf("activity-log-queue")).toEqual([PermissionType.ExportActivityLogQueue]);
    for (const resource of APP_RESOURCES) expect(permissionOf(resource), resource).toEqual([PermissionType.ExportApproval]);
  });

  it("names every export permission permission:<screen>:export (the role screen labels it by the last segment, shown inside the screen's group)", () => {
    const exportPermissions = Object.values(PermissionType).filter((value) => value.endsWith(":export"));
    expect(exportPermissions).toHaveLength(7);
    for (const permission of exportPermissions) expect(permission).toMatch(/^permission:[a-z-]+:export$/);
    // Mọi danh sách đều đòi đúng một quyền xuất
    for (const definition of [...CORE_EXPORT_DEFINITIONS, ...APP_EXPORT_DEFINITIONS]) {
      expect(
        definition.permissions.filter((p) => p.endsWith(":export")),
        definition.resource,
      ).toHaveLength(1);
    }
  });

  it("asks for the permission to view the list besides exporting, except lists everyone can open", () => {
    const viewPermissions = (resource: string) =>
      [...CORE_EXPORT_DEFINITIONS, ...APP_EXPORT_DEFINITIONS]
        .find((definition) => definition.resource === resource)
        ?.permissions.filter((p) => !p.endsWith(":export"));
    expect(viewPermissions("user")).toEqual([PermissionType.MenuUser]);
    expect(viewPermissions("approval-request-all")).toEqual([PermissionType.MenuAllApprovalRequest]);
    expect(viewPermissions("activity-log-queue")).toEqual([PermissionType.ViewActivityLogQueue]);
    // Của tôi / hộp chờ duyệt / ủy quyền / nhật ký: ai xem được thì xuất được; nhật ký và ủy quyền tab "tất cả" kiểm thêm lúc chuẩn bị (resolveScope)
    expect(viewPermissions("approval-inbox")).toEqual([]);
    expect(viewPermissions("approval-request-mine")).toEqual([]);
  });
});
