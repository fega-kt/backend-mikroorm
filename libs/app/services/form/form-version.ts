import type { EntityManager } from "@mikro-orm/core";
import { isDeepStrictEqual } from "node:util";
import type { FormEntity } from "../../entities/form";
import { FormVersionEntity } from "../../entities/form-version";
import type { FormSchema } from "../approval-engine/form-schema";

/** Hai định nghĩa form giống nhau (null / undefined coi như nhau) → sửa form mà không đổi trường thì không sinh phiên bản mới */
export function sameFormSchema(a?: FormSchema | null, b?: FormSchema | null) {
  return isDeepStrictEqual(a ?? null, b ?? null);
}

export function latestFormVersion(em: EntityManager, formId: string) {
  return em.findOne(FormVersionEntity, { form: formId }, { orderBy: { version: "DESC" } });
}

/** Phiên bản mới nhất của form; form chưa có phiên bản nào (vừa tạo) thì dựng v1 từ định nghĩa hiện tại */
export async function ensureLatestFormVersion(em: EntityManager, form: FormEntity, audit: object = {}) {
  const existing = await latestFormVersion(em, form.id);
  if (existing) return existing;
  return em.create(FormVersionEntity, { form, version: 1, formSchema: form.formSchema, ...audit });
}

/** Sinh phiên bản mới khi định nghĩa form vừa đổi so với phiên bản mới nhất; trả về null nếu không đổi */
export async function recordFormVersionIfChanged(em: EntityManager, form: FormEntity, audit: object = {}) {
  const latest = await latestFormVersion(em, form.id);
  if (latest && sameFormSchema(latest.formSchema, form.formSchema)) return null;
  return em.create(FormVersionEntity, { form, version: (latest?.version ?? 0) + 1, formSchema: form.formSchema, ...audit });
}
