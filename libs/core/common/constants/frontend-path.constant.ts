import { ENV } from "@config/env.config";

/** Đường dẫn trang FE mà BE tạo link tới (email, thông báo) — phải khớp route của FE */
export enum FrontendPath {
  /** Chi tiết tờ trình: /approval/requests/:id */
  ApprovalRequests = "/approval/requests",
}

/** Link đầy đủ tới trang FE: frontendUrl(FrontendPath.ApprovalRequests, id) → https://app/approval/requests/<id> */
export function frontendUrl(path: FrontendPath, ...segments: string[]) {
  return [ENV.FRONTEND_URL.replace(/\/$/, "") + path, ...segments.map(encodeURIComponent)].join("/");
}
