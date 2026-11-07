import { PermissionType } from "@common/base/permission-type.enum";
import type { ExportDefinition } from "@core-service/services/export/export.types";
import { type ExportColumn, exportLabel } from "@core-service/services/export/export.util";
import { ForbiddenException } from "@nestjs/common";
import type { FilterQuery } from "@mikro-orm/core";
import { approvalDelegationFilterValidation } from "../../controllers/approval-delegation/approval-delegation.validation";
import { ApprovalDelegationEntity, ApprovalDelegationMode } from "../../entities/approval-delegation";
import { buildDelegationWhere } from "../approval-delegation/delegation-filter";

export interface DelegationExportRow {
  id: string;
  fromName?: string | null;
  toName?: string | null;
  requestTypeName?: string | null;
  mode: ApprovalDelegationMode;
  startAt: Date;
  endAt: Date;
  reason?: string | null;
  createdByName?: string | null;
  createdAt: Date;
}

const MODE_LABEL: Record<ApprovalDelegationMode, ReturnType<typeof exportLabel>> = {
  [ApprovalDelegationMode.Window]: exportLabel("Trong thời gian ủy quyền", "During the period", "授权期间"),
  [ApprovalDelegationMode.Handover]: exportLabel("Giao phiếu", "Hand over", "转交单据"),
};
const ALL_TYPES = exportLabel("Mọi loại tờ trình", "All request types", "所有申请类型");

export const DELEGATION_EXPORT_COLUMNS: ExportColumn<DelegationExportRow>[] = [
  { key: "fromUser", header: exportLabel("Người ủy quyền", "Delegator", "授权人"), width: 26, value: (row) => row.fromName },
  { key: "toUser", header: exportLabel("Người được ủy quyền", "Delegate", "被授权人"), width: 26, value: (row) => row.toName },
  {
    key: "requestType",
    header: exportLabel("Loại tờ trình", "Request type", "申请类型"),
    width: 28,
    value: (row, lang) => row.requestTypeName ?? ALL_TYPES[lang],
  },
  {
    key: "mode",
    header: exportLabel("Hình thức", "Mode", "方式"),
    width: 24,
    value: (row, lang) => MODE_LABEL[row.mode]?.[lang] ?? row.mode,
  },
  { key: "startAt", header: exportLabel("Từ", "From", "开始"), width: 18, type: "datetime", value: (row) => row.startAt },
  { key: "endAt", header: exportLabel("Đến", "To", "结束"), width: 18, type: "datetime", value: (row) => row.endAt },
  { key: "reason", header: exportLabel("Lý do", "Reason", "原因"), width: 40, value: (row) => row.reason },
  { key: "createdBy", header: exportLabel("Người tạo", "Created by", "创建人"), width: 24, value: (row) => row.createdByName },
  {
    key: "createdAt",
    header: exportLabel("Ngày tạo", "Created at", "创建时间"),
    width: 18,
    type: "datetime",
    value: (row) => row.createdAt,
  },
];

export const delegationDefinition: ExportDefinition<DelegationExportRow> = {
  resource: "approval-delegation",
  permissions: [PermissionType.ExportApproval],
  filterSchema: approvalDelegationFilterValidation,
  columns: DELEGATION_EXPORT_COLUMNS,
  title: exportLabel("Ủy quyền", "Delegations", "授权"),
  /** Tab "tất cả" cần quyền quản lý ủy quyền; chốt lúc chuẩn bị vì worker không có quyền của người dùng */
  resolveScope: (user, filter) => {
    const tab = (filter as { tab?: string }).tab;
    const canManage = user.canAccess([PermissionType.ManageApprovalDelegation]);
    if (tab === "all" && !canManage) throw new ForbiddenException("You cannot export all delegations");
    return { canManage };
  },
  open: async (em, filter, userId, cutoff, scope) => {
    const where = {
      $and: [
        buildDelegationWhere(
          approvalDelegationFilterValidation.parse(filter),
          userId,
          (scope as { canManage?: boolean } | undefined)?.canManage === true,
        ),
        { createdAt: { $lte: cutoff } },
      ],
    } as FilterQuery<ApprovalDelegationEntity>;
    return {
      count: () => em.count(ApprovalDelegationEntity, where),
      fetch: async (afterId, limit) => {
        em.clear();
        const rows = await em.find(
          ApprovalDelegationEntity,
          { $and: [where, ...(afterId ? [{ id: { $gt: afterId } }] : [])] },
          { orderBy: { id: "ASC" }, limit, populate: ["fromUser", "toUser", "createdBy", "requestType"], disableIdentityMap: true },
        );
        return rows.map((row) => ({
          id: row.id,
          fromName: row.fromUser?.fullName,
          toName: row.toUser?.fullName,
          requestTypeName: row.requestType?.name,
          mode: row.mode,
          startAt: row.startAt,
          endAt: row.endAt,
          reason: row.reason,
          createdByName: row.createdBy?.fullName,
          createdAt: row.createdAt,
        }));
      },
    };
  },
};
