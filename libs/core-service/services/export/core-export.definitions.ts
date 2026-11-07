import { PermissionType } from "@common/base/permission-type.enum";
import { listFilterValidation } from "@common/pagination/pagination.validation";
import { ForbiddenException } from "@nestjs/common";
import type { EntityManager, EntityName, FilterQuery } from "@mikro-orm/core";
import { activityLogFilterValidation } from "../../controllers/activity-log/activity-log.validation";
import { activityLogQueueFilterValidation } from "../../controllers/activity-log-queue/activity-log-queue.validation";
import { departmentListFilterValidation } from "../../controllers/department/department.validation";
import { groupListFilterValidation } from "../../controllers/group/group.validation";
import { userListFilterValidation } from "../../controllers/user/user.validation";
import { ActivityLogEntity } from "../../entities/activity-log";
import { ActivityLogQueueEntity } from "../../entities/activity-log-queue";
import { DepartmentEntity, DepartmentStatus } from "../../entities/department";
import { GroupEntity } from "../../entities/group";
import { RoleEntity } from "../../entities/role";
import { UserEntity } from "../../entities/user";
import { buildActivityLogWhere, type ActivityLogScope } from "../activity-log/activity-log-filter";
import { buildActivityLogQueueWhere } from "../activity-log-queue/activity-log-queue-filter";
import { buildDepartmentListWhere } from "../department/department-list-filter";
import { buildGroupListWhere } from "../group/group-list-filter";
import { buildRoleListWhere } from "../role/role-list-filter";
import { buildUserListWhere } from "../user/user-list-filter";
import { eraseRowType, type ExportDefinition, type ExportScope } from "./export.types";
import { type ExportColumn, exportLabel } from "./export.util";

/**
 * Đọc dữ liệu theo khóa id: điều kiện của danh sách + chặn trên theo thời điểm chốt (dòng thêm trong lúc xuất không lọt vào).
 * `load` lấy một lô thực thể (chỉ cột cần) rồi đổi thành dòng của file.
 */
function keysetScope<E extends { id: string }, L, R extends { id: string }>(
  em: EntityManager,
  entity: EntityName<E>,
  where: FilterQuery<E>,
  load: (where: FilterQuery<E>, limit: number) => Promise<L[]>,
  toRow: (loaded: L) => R,
): ExportScope<R> {
  const bounded = where;
  return {
    count: () => em.count(entity, bounded),
    fetch: async (afterId, limit) => {
      em.clear();
      const paged = { $and: [bounded, ...(afterId ? [{ id: { $gt: afterId } }] : [])] } as FilterQuery<E>;
      return (await load(paged, limit)).map(toRow);
    },
  };
}

const withCutoff = <E>(where: FilterQuery<E>, cutoff: Date) => ({ $and: [where, { createdAt: { $lte: cutoff } }] }) as FilterQuery<E>;

const ACTIVE_LABEL = {
  true: exportLabel("Hoạt động", "Active", "启用"),
  false: exportLabel("Ngừng hoạt động", "Inactive", "停用"),
};
const activeText = (active: boolean | null | undefined, lang: keyof ReturnType<typeof exportLabel>) =>
  ACTIVE_LABEL[active ? "true" : "false"][lang];

const idColumnsAudit = <T extends { createdByName?: string | null; createdAt: Date; updatedAt: Date }>(): ExportColumn<T>[] => [
  { key: "createdBy", header: exportLabel("Người tạo", "Created by", "创建人"), width: 24, value: (row) => row.createdByName },
  {
    key: "createdAt",
    header: exportLabel("Ngày tạo", "Created at", "创建时间"),
    width: 18,
    type: "datetime",
    value: (row) => row.createdAt,
  },
  {
    key: "updatedAt",
    header: exportLabel("Cập nhật", "Updated at", "更新时间"),
    width: 18,
    type: "datetime",
    value: (row) => row.updatedAt,
  },
];

/* ===================== Người dùng ===================== */

export interface UserExportRow {
  id: string;
  fullName: string;
  loginName: string;
  workEmail?: string | null;
  phoneNumber?: string | null;
  departmentName?: string | null;
  isActive: boolean;
  createdByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Chỉ các cột an toàn để lộ ra file — không có mật khẩu, mã đăng nhập, thiết bị… */
export const USER_EXPORT_COLUMNS: ExportColumn<UserExportRow>[] = [
  { key: "fullName", header: exportLabel("Họ tên", "Full name", "姓名"), width: 28, value: (row) => row.fullName },
  { key: "loginName", header: exportLabel("Email đăng nhập", "Login email", "登录邮箱"), width: 30, value: (row) => row.loginName },
  { key: "workEmail", header: exportLabel("Email công việc", "Work email", "工作邮箱"), width: 30, value: (row) => row.workEmail },
  { key: "phoneNumber", header: exportLabel("Số điện thoại", "Phone", "电话"), width: 18, value: (row) => row.phoneNumber },
  { key: "department", header: exportLabel("Phòng ban", "Department", "部门"), width: 26, value: (row) => row.departmentName },
  { key: "status", header: exportLabel("Trạng thái", "Status", "状态"), width: 18, value: (row, lang) => activeText(row.isActive, lang) },
  ...idColumnsAudit<UserExportRow>(),
];

const userDefinition: ExportDefinition<UserExportRow> = {
  resource: "user",
  permissions: [PermissionType.MenuUser, PermissionType.ExportUser],
  filterSchema: userListFilterValidation,
  columns: USER_EXPORT_COLUMNS,
  title: exportLabel("Người dùng", "Users", "用户"),
  open: async (em, filter, _userId, cutoff) =>
    keysetScope(
      em,
      UserEntity,
      withCutoff(buildUserListWhere(userListFilterValidation.parse(filter)), cutoff),
      (where, limit) =>
        em.find(UserEntity, where, {
          orderBy: { id: "ASC" },
          limit,
          fields: [
            "id",
            "fullName",
            "loginName",
            "workEmail",
            "phoneNumber",
            "isActive",
            "createdAt",
            "updatedAt",
            "department.name",
            "createdBy.fullName",
          ],
          populate: ["department", "createdBy"],
          disableIdentityMap: true,
        }),
      (user) => ({
        id: user.id,
        fullName: user.fullName,
        loginName: user.loginName,
        workEmail: user.workEmail,
        phoneNumber: user.phoneNumber,
        departmentName: user.department?.name,
        isActive: user.isActive,
        createdByName: user.createdBy?.fullName,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }),
    ),
};

/* ===================== Phòng ban ===================== */

export interface DepartmentExportRow {
  id: string;
  code: string;
  name: string;
  parentCode?: string | null;
  status: DepartmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const DEPARTMENT_EXPORT_COLUMNS: ExportColumn<DepartmentExportRow>[] = [
  { key: "code", header: exportLabel("Mã phòng ban", "Code", "编码"), width: 22, value: (row) => row.code },
  { key: "name", header: exportLabel("Tên phòng ban", "Name", "名称"), width: 34, value: (row) => row.name },
  { key: "parentCode", header: exportLabel("Mã cấp trên", "Parent code", "上级编码"), width: 24, value: (row) => row.parentCode },
  {
    key: "status",
    header: exportLabel("Trạng thái", "Status", "状态"),
    width: 18,
    value: (row, lang) => activeText(row.status === DepartmentStatus.ACTIVE, lang),
  },
  {
    key: "createdAt",
    header: exportLabel("Ngày tạo", "Created at", "创建时间"),
    width: 18,
    type: "datetime",
    value: (row) => row.createdAt,
  },
  {
    key: "updatedAt",
    header: exportLabel("Cập nhật", "Updated at", "更新时间"),
    width: 18,
    type: "datetime",
    value: (row) => row.updatedAt,
  },
];

const departmentDefinition: ExportDefinition<DepartmentExportRow> = {
  resource: "department",
  permissions: [PermissionType.MenuDeparment, PermissionType.ExportDepartment],
  filterSchema: departmentListFilterValidation,
  columns: DEPARTMENT_EXPORT_COLUMNS,
  title: exportLabel("Phòng ban", "Departments", "部门"),
  open: async (em, filter, _userId, cutoff) =>
    keysetScope(
      em,
      DepartmentEntity,
      withCutoff(buildDepartmentListWhere(departmentListFilterValidation.parse(filter)), cutoff),
      (where, limit) =>
        em.find(DepartmentEntity, where, {
          orderBy: { id: "ASC" },
          limit,
          fields: ["id", "code", "name", "parentCode", "status", "createdAt", "updatedAt"],
          disableIdentityMap: true,
        }),
      (department) => ({
        id: department.id,
        code: department.code,
        name: department.name,
        parentCode: department.parentCode,
        status: department.status,
        createdAt: department.createdAt,
        updatedAt: department.updatedAt,
      }),
    ),
};

/* ===================== Nhóm ===================== */

export interface GroupExportRow {
  id: string;
  name: string;
  description?: string | null;
  createdByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const GROUP_EXPORT_COLUMNS: ExportColumn<GroupExportRow>[] = [
  { key: "name", header: exportLabel("Tên nhóm", "Name", "名称"), width: 30, value: (row) => row.name },
  { key: "description", header: exportLabel("Mô tả", "Description", "描述"), width: 48, value: (row) => row.description },
  ...idColumnsAudit<GroupExportRow>(),
];

const groupDefinition: ExportDefinition<GroupExportRow> = {
  resource: "group",
  permissions: [PermissionType.MenuGroup, PermissionType.ExportGroup],
  filterSchema: groupListFilterValidation,
  columns: GROUP_EXPORT_COLUMNS,
  title: exportLabel("Nhóm", "Groups", "用户组"),
  open: async (em, filter, _userId, cutoff) =>
    keysetScope(
      em,
      GroupEntity,
      withCutoff(buildGroupListWhere(groupListFilterValidation.parse(filter)), cutoff),
      (where, limit) =>
        em.find(GroupEntity, where, {
          orderBy: { id: "ASC" },
          limit,
          fields: ["id", "name", "description", "createdAt", "updatedAt", "createdBy.fullName"],
          populate: ["createdBy"],
          disableIdentityMap: true,
        }),
      (group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        createdByName: group.createdBy?.fullName,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      }),
    ),
};

/* ===================== Vai trò ===================== */

export interface RoleExportRow {
  id: string;
  name: string;
  description?: string | null;
  rightsCount: number;
  createdByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ROLE_EXPORT_COLUMNS: ExportColumn<RoleExportRow>[] = [
  { key: "name", header: exportLabel("Tên vai trò", "Name", "名称"), width: 30, value: (row) => row.name },
  { key: "description", header: exportLabel("Mô tả", "Description", "描述"), width: 48, value: (row) => row.description },
  {
    key: "rightsCount",
    header: exportLabel("Số quyền", "Permissions", "权限数"),
    width: 12,
    type: "number",
    value: (row) => row.rightsCount,
  },
  ...idColumnsAudit<RoleExportRow>(),
];

const roleDefinition: ExportDefinition<RoleExportRow> = {
  resource: "role",
  permissions: [PermissionType.MenuRole, PermissionType.ExportRole],
  filterSchema: listFilterValidation,
  columns: ROLE_EXPORT_COLUMNS,
  title: exportLabel("Vai trò", "Roles", "角色"),
  open: async (em, filter, _userId, cutoff) =>
    keysetScope(
      em,
      RoleEntity,
      withCutoff(buildRoleListWhere(listFilterValidation.parse(filter)), cutoff),
      (where, limit) =>
        em.find(RoleEntity, where, {
          orderBy: { id: "ASC" },
          limit,
          fields: ["id", "name", "description", "rights", "createdAt", "updatedAt", "createdBy.fullName"],
          populate: ["createdBy"],
          disableIdentityMap: true,
        }),
      (role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        rightsCount: role.rights?.length ?? 0,
        createdByName: role.createdBy?.fullName,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      }),
    ),
};

/* ===================== Nhật ký hoạt động ===================== */

export interface ActivityLogExportRow {
  id: string;
  createdAt: Date;
  actorName?: string | null;
  action: string;
  type: string;
  parentType: string;
  parentId: string;
  ip?: string | null;
  device?: string | null;
  requestId?: string | null;
}

/** Không xuất oldData / newData (có thể chứa dữ liệu nhạy cảm và rất lớn) */
export const ACTIVITY_LOG_EXPORT_COLUMNS: ExportColumn<ActivityLogExportRow>[] = [
  { key: "createdAt", header: exportLabel("Thời gian", "Time", "时间"), width: 18, type: "datetime", value: (row) => row.createdAt },
  { key: "actor", header: exportLabel("Người thực hiện", "Actor", "操作人"), width: 26, value: (row) => row.actorName },
  { key: "action", header: exportLabel("Hành động", "Action", "操作"), width: 16, value: (row) => row.action },
  { key: "type", header: exportLabel("Loại", "Type", "类型"), width: 16, value: (row) => row.type },
  { key: "parentType", header: exportLabel("Đối tượng", "Subject", "对象"), width: 20, value: (row) => row.parentType },
  { key: "parentId", header: exportLabel("Mã đối tượng", "Subject id", "对象编号"), width: 38, value: (row) => row.parentId },
  { key: "ip", header: exportLabel("IP", "IP", "IP"), width: 18, value: (row) => row.ip },
  { key: "device", header: exportLabel("Thiết bị", "Device", "设备"), width: 40, value: (row) => row.device },
  { key: "requestId", header: exportLabel("Mã yêu cầu", "Request id", "请求编号"), width: 38, value: (row) => row.requestId },
];

const activityLogDefinition: ExportDefinition<ActivityLogExportRow> = {
  resource: "activity-log",
  permissions: [PermissionType.ExportActivityLog],
  filterSchema: activityLogFilterValidation,
  columns: ACTIVITY_LOG_EXPORT_COLUMNS,
  title: exportLabel("Nhật ký hoạt động", "Activity log", "操作日志"),
  /** Xem toàn hệ thống hay chỉ phòng ban của mình: chốt lúc chuẩn bị vì worker không có quyền của người dùng */
  resolveScope: (user): ActivityLogScope => {
    const all = user.canAccess([PermissionType.ViewActivityLogAll]);
    if (!all && !user.canAccess([PermissionType.ViewActivityLogDepartment]))
      throw new ForbiddenException("You cannot export the activity log");
    return { all, departmentId: user.department?.id ?? null };
  },
  open: async (em, filter, _userId, cutoff, scope) => {
    const where = await buildActivityLogWhere(em, activityLogFilterValidation.parse(filter), scope as ActivityLogScope);
    // Không thuộc phòng ban nào: không thấy log nào
    if (!where) return { count: async () => 0, fetch: async () => [] };
    return keysetScope(
      em,
      ActivityLogEntity,
      withCutoff(where, cutoff),
      (paged, limit) =>
        em.find(ActivityLogEntity, paged, {
          orderBy: { id: "ASC" },
          limit,
          fields: ["id", "createdAt", "action", "type", "parentType", "parentId", "ip", "device", "requestId", "createdBy.fullName"],
          populate: ["createdBy"],
          disableIdentityMap: true,
        }),
      (log) => ({
        id: log.id,
        createdAt: log.createdAt,
        actorName: log.createdBy?.fullName,
        action: log.action,
        type: log.type,
        parentType: log.parentType,
        parentId: log.parentId,
        ip: log.ip,
        device: log.device,
        requestId: log.requestId,
      }),
    );
  },
};

/* ===================== Hàng đợi gửi mail ===================== */

export interface ActivityLogQueueExportRow {
  id: string;
  createdAt: Date;
  recipient?: string | null;
  subject?: string | null;
  type: string;
  status: string;
  attempts: number;
  error?: string | null;
  lastAttemptAt?: Date | null;
}

export const ACTIVITY_LOG_QUEUE_EXPORT_COLUMNS: ExportColumn<ActivityLogQueueExportRow>[] = [
  { key: "createdAt", header: exportLabel("Thời gian", "Time", "时间"), width: 18, type: "datetime", value: (row) => row.createdAt },
  { key: "recipient", header: exportLabel("Người nhận", "Recipient", "收件人"), width: 32, value: (row) => row.recipient },
  { key: "subject", header: exportLabel("Tiêu đề", "Subject", "主题"), width: 48, value: (row) => row.subject },
  { key: "type", header: exportLabel("Loại", "Type", "类型"), width: 26, value: (row) => row.type },
  { key: "status", header: exportLabel("Trạng thái", "Status", "状态"), width: 14, value: (row) => row.status },
  { key: "attempts", header: exportLabel("Số lần thử", "Attempts", "尝试次数"), width: 12, type: "number", value: (row) => row.attempts },
  { key: "error", header: exportLabel("Lỗi", "Error", "错误"), width: 40, value: (row) => row.error },
  {
    key: "lastAttemptAt",
    header: exportLabel("Lần thử cuối", "Last attempt", "最近尝试"),
    width: 18,
    type: "datetime",
    value: (row) => row.lastAttemptAt,
  },
];

const activityLogQueueDefinition: ExportDefinition<ActivityLogQueueExportRow> = {
  resource: "activity-log-queue",
  permissions: [PermissionType.ViewActivityLogQueue, PermissionType.ExportActivityLogQueue],
  filterSchema: activityLogQueueFilterValidation,
  columns: ACTIVITY_LOG_QUEUE_EXPORT_COLUMNS,
  title: exportLabel("Hàng đợi gửi mail", "Email queue", "邮件队列"),
  open: async (em, filter, _userId, cutoff) =>
    keysetScope(
      em,
      ActivityLogQueueEntity,
      withCutoff(buildActivityLogQueueWhere(activityLogQueueFilterValidation.parse(filter)), cutoff),
      (where, limit) =>
        em.find(ActivityLogQueueEntity, where, {
          orderBy: { id: "ASC" },
          limit,
          fields: ["id", "createdAt", "recipient", "subject", "type", "status", "attempts", "error", "lastAttemptAt"],
          disableIdentityMap: true,
        }),
      (item) => ({
        id: item.id,
        createdAt: item.createdAt,
        recipient: item.recipient,
        subject: item.subject,
        type: item.type,
        status: item.status,
        attempts: item.attempts,
        error: item.error,
        lastAttemptAt: item.lastAttemptAt,
      }),
    ),
};

/** Định nghĩa của các danh sách thuộc core (người dùng, phòng ban, nhóm, vai trò, nhật ký, hàng đợi mail) */
export const CORE_EXPORT_DEFINITIONS: ExportDefinition<never>[] = [
  eraseRowType(userDefinition),
  eraseRowType(departmentDefinition),
  eraseRowType(groupDefinition),
  eraseRowType(roleDefinition),
  eraseRowType(activityLogDefinition),
  eraseRowType(activityLogQueueDefinition),
];
