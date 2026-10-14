import type { EntityManager } from "@mikro-orm/core";
import { isDeepStrictEqual } from "node:util";
import type { RequestTypeEntity, RequestTypeStatus } from "../../entities/request-type";
import { RequestTypeVersionEntity } from "../../entities/request-type-version";
import type { AttachmentConfig } from "../approval-engine/attachment-config";

/** Phần cấu hình của loại tờ trình được đóng băng theo phiên bản (quan hệ so theo id) */
export interface TypeSnapshot {
  code: string;
  name: string;
  prefix: string;
  description?: string | null;
  categoryId: string;
  formId: string;
  status: RequestTypeStatus;
  attachmentConfig?: AttachmentConfig | null;
}

const orNull = <T>(value: T | null | undefined) => value ?? null;

export function snapshotOf(source: RequestTypeEntity | RequestTypeVersionEntity): TypeSnapshot {
  return {
    code: source.code,
    name: source.name,
    prefix: source.prefix,
    description: source.description,
    categoryId: source.category.id,
    formId: source.form.id,
    status: source.status,
    attachmentConfig: source.attachmentConfig,
  };
}

/** Hai cấu hình giống nhau (null / undefined / rỗng coi như nhau) → sửa loại mà không đổi gì đáng kể thì không sinh phiên bản mới */
export function sameSnapshot(a: TypeSnapshot, b: TypeSnapshot) {
  return (
    a.code === b.code &&
    a.name === b.name &&
    a.prefix === b.prefix &&
    (a.description ?? "") === (b.description ?? "") &&
    a.categoryId === b.categoryId &&
    a.formId === b.formId &&
    a.status === b.status &&
    isDeepStrictEqual(orNull(a.attachmentConfig), orNull(b.attachmentConfig))
  );
}

export function latestTypeVersion(em: EntityManager, requestTypeId: string) {
  return em.findOne(RequestTypeVersionEntity, { requestType: requestTypeId }, { orderBy: { version: "DESC" } });
}

const buildVersion = (em: EntityManager, requestType: RequestTypeEntity, version: number, audit: object) =>
  em.create(RequestTypeVersionEntity, {
    requestType,
    version,
    code: requestType.code,
    name: requestType.name,
    prefix: requestType.prefix,
    description: requestType.description,
    category: requestType.category,
    form: requestType.form,
    status: requestType.status,
    attachmentConfig: requestType.attachmentConfig,
    ...audit,
  });

/** Phiên bản mới nhất của loại; loại chưa có phiên bản nào (vừa tạo) thì dựng v1 từ cấu hình hiện tại */
export async function ensureLatestTypeVersion(em: EntityManager, requestType: RequestTypeEntity, audit: object = {}) {
  return (await latestTypeVersion(em, requestType.id)) ?? buildVersion(em, requestType, 1, audit);
}

/** Sinh phiên bản mới khi cấu hình của loại vừa đổi so với phiên bản mới nhất; trả về null nếu không đổi */
export async function recordTypeVersionIfChanged(em: EntityManager, requestType: RequestTypeEntity, audit: object = {}) {
  const latest = await latestTypeVersion(em, requestType.id);
  if (latest) {
    await em.populate(latest, ["category", "form"]);
    if (sameSnapshot(snapshotOf(latest), snapshotOf(requestType))) return null;
  }
  return buildVersion(em, requestType, (latest?.version ?? 0) + 1, audit);
}
