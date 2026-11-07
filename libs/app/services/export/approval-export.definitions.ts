import { PermissionType } from "@common/base/permission-type.enum";
import type { PrincipalEntity } from "@core-service/entities/principal";
import { eraseRowType, type ExportDefinition } from "@core-service/services/export/export.types";
import type { EntityManager, FilterQuery } from "@mikro-orm/core";
import { inboxFilterValidation } from "../../controllers/approval-task/approval-task.validation";
import { approvalRequestFilterValidation } from "../../controllers/approval-request/approval-request.validation";
import { ApprovalRequestEntity } from "../../entities/approval-request";
import { ApprovalTaskEntity } from "../../entities/approval-task";
import { allRequestsScope, buildRequestListWhere, myRequestsScope } from "../approval-request/request-list-filter";
import { buildInboxWhere } from "../approval-task/inbox-filter";
import {
  EXPORT_TITLES,
  INBOX_EXPORT_COLUMNS,
  REQUEST_EXPORT_COLUMNS,
  type InboxExportRow,
  type RequestExportRow,
} from "./approval-export.columns";

const requestPopulate = ["requestTypeVersion", "requester", "department", "category"] as const;
const inboxPopulate = [
  "request",
  "request.requestTypeVersion",
  "request.requester",
  "request.department",
  "approver",
  "approver.user",
  "approver.group",
  "originApprover",
  "originApprover.user",
  "originApprover.group",
] as const;

const principalName = (p?: PrincipalEntity | null) => (p ? p.user?.fullName || p.name || p.group?.name || null : null);

export function toRequestRow(entity: ApprovalRequestEntity): RequestExportRow {
  return {
    id: entity.id,
    code: entity.code,
    title: entity.title,
    status: entity.status,
    priority: entity.priority,
    requestTypeName: entity.requestTypeVersion?.name,
    categoryName: entity.category?.name,
    requesterName: entity.requester?.fullName,
    departmentName: entity.department?.name,
    submittedAt: entity.submittedAt,
    closedAt: entity.closedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toInboxRow(task: ApprovalTaskEntity): InboxExportRow {
  const request = task.request;
  return {
    id: task.id,
    taskStatus: task.status,
    nodeName: task.nodeName,
    approverName: principalName(task.approver),
    originApproverName: principalName(task.originApprover),
    dueAt: task.dueAt,
    actedAt: task.actedAt,
    comment: task.comment,
    createdAt: task.createdAt,
    request: {
      code: request.code,
      title: request.title,
      status: request.status,
      priority: request.priority,
      requestTypeName: request.requestTypeVersion?.name,
      requesterName: request.requester?.fullName,
      departmentName: request.department?.name,
      submittedAt: request.submittedAt,
    },
  };
}

/** Phạm vi đọc tờ trình: điều kiện của danh sách + chặn trên theo thời điểm chốt, đọc theo khóa id */
function openRequests(em: EntityManager, where: FilterQuery<ApprovalRequestEntity>) {
  return {
    count: () => em.count(ApprovalRequestEntity, where),
    fetch: async (afterId: string | null, limit: number) => {
      em.clear();
      const rows = await em.find(
        ApprovalRequestEntity,
        { $and: [where, ...(afterId ? [{ id: { $gt: afterId } }] : [])] },
        // payload (JSON của biểu mẫu) có thể lớn và không nằm trong cột nào của file → không đọc
        { orderBy: { id: "ASC" }, limit, populate: [...requestPopulate], exclude: ["payload"], disableIdentityMap: true },
      );
      return rows.map(toRequestRow);
    },
  };
}

const requestsDefinition = (resource: "approval-request-mine" | "approval-request-all"): ExportDefinition<RequestExportRow> => ({
  resource,
  permissions:
    resource === "approval-request-all"
      ? [PermissionType.MenuAllApprovalRequest, PermissionType.ExportApproval]
      : [PermissionType.ExportApproval],
  filterSchema: approvalRequestFilterValidation,
  columns: REQUEST_EXPORT_COLUMNS,
  title: EXPORT_TITLES[resource],
  open: async (em, filter, userId, cutoff) => {
    const parsed = approvalRequestFilterValidation.parse(filter);
    const scope = resource === "approval-request-mine" ? myRequestsScope(userId) : allRequestsScope(parsed);
    return openRequests(em, {
      $and: [buildRequestListWhere(scope, parsed), { createdAt: { $lte: cutoff } }],
    });
  },
});

const inboxDefinition: ExportDefinition<InboxExportRow> = {
  resource: "approval-inbox",
  permissions: [PermissionType.ExportApproval],
  filterSchema: inboxFilterValidation,
  columns: INBOX_EXPORT_COLUMNS,
  title: EXPORT_TITLES["approval-inbox"],
  open: async (em, filter, userId, cutoff) => {
    const where = {
      $and: [await buildInboxWhere(em, inboxFilterValidation.parse(filter), userId), { createdAt: { $lte: cutoff } }],
    } as FilterQuery<ApprovalTaskEntity>;
    return {
      count: () => em.count(ApprovalTaskEntity, where),
      fetch: async (afterId, limit) => {
        em.clear();
        const tasks = await em.find(
          ApprovalTaskEntity,
          { $and: [where, ...(afterId ? [{ id: { $gt: afterId } }] : [])] },
          { orderBy: { id: "ASC" }, limit, populate: [...inboxPopulate], disableIdentityMap: true },
        );
        return tasks.map(toInboxRow);
      },
    };
  },
};

export const APPROVAL_EXPORT_DEFINITIONS: ExportDefinition<never>[] = [
  eraseRowType(requestsDefinition("approval-request-mine")),
  eraseRowType(requestsDefinition("approval-request-all")),
  eraseRowType(inboxDefinition),
];
