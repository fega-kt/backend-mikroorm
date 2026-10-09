import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestInfo {
  requestId: string;
  method: string;
  path: string;
}

const storage = new AsyncLocalStorage<RequestInfo>();

export function runWithRequestInfo<T>(info: RequestInfo, fn: () => T): T {
  return storage.run(info, fn);
}

export function getRequestInfo(): RequestInfo | undefined {
  return storage.getStore();
}
