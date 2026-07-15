import { RequestContext } from "@mikro-orm/core";

interface RequestInfo {
  method: string;
  path: string;
}

const infoMap = new WeakMap<object, RequestInfo>();

export function setRequestInfo(info: RequestInfo): void {
  const ctx = RequestContext.currentRequestContext();
  if (ctx) infoMap.set(ctx, info);
}

export function getRequestInfo(): RequestInfo | undefined {
  const ctx = RequestContext.currentRequestContext();
  return ctx ? infoMap.get(ctx) : undefined;
}
