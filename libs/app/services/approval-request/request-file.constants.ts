import { STORAGE_PATH } from "@common/constants/storage.constant";

/**
 * Loại tệp trong một tờ trình — trùng tên trường của tờ trình (documents / attachments)
 * và là tên thư mục con trên storage. Thêm loại mới (vd: comments) tại đây.
 */
export enum RequestFileCategory {
  /** Văn bản tờ trình */
  Documents = "documents",
  /** Tài liệu đính kèm */
  Attachments = "attachments",
}

/** Thư mục gốc chứa mọi tệp của một tờ trình: Attachments/{requestId} */
export function requestFileRoot(requestId: string): string {
  return `${STORAGE_PATH.ATTACHMENTS}/${requestId}`;
}

/** Thư mục tệp người trình tải lên cho một vòng: Attachments/{requestId}/round-{n}/{category} */
export function buildRequestFileFolder(requestId: string, round: number, category: RequestFileCategory): string {
  return `${requestFileRoot(requestId)}/round-${round}/${category}`;
}

/** Thư mục bản PDF chuyển đổi / đã ký của một vòng: Attachments/{requestId}/round-{n}/signed */
export function buildSignedFileFolder(requestId: string, round: number): string {
  return `${requestFileRoot(requestId)}/round-${round}/signed`;
}

/**
 * Tệp người trình tải lên cho đúng tờ trình + loại tệp, ở bất kỳ vòng nào
 * (tệp giữ nguyên qua nhiều vòng vẫn nằm ở thư mục vòng đầu; tệp trước khi chia vòng nằm ở Attachments/{requestId}/{category}).
 */
export function isRequestFileKey(key: string, requestId: string, category: RequestFileCategory): boolean {
  const root = `${requestFileRoot(requestId)}/`;
  if (!key.startsWith(root)) return false;
  return new RegExp(`^(round-\\d+/)?${category}/[^/]+$`).test(key.slice(root.length));
}
