import { eraseRowType, type ExportDefinition } from "@core-service/services/export/export.types";
import { APPROVAL_EXPORT_DEFINITIONS } from "./approval-export.definitions";
import { delegationDefinition } from "./delegation-export.definition";

/** Mọi danh sách xuất của app (phê duyệt): tiêm vào sổ đăng ký của app API và của worker app-jobs */
export const APP_EXPORT_DEFINITIONS: ExportDefinition<never>[] = [...APPROVAL_EXPORT_DEFINITIONS, eraseRowType(delegationDefinition)];
