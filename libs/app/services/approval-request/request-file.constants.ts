import { STORAGE_PATH } from "@common/constants/storage.constant";
import { monthDayPathVn } from "@common/utils/vn-date.util";

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

/**
 * Thư mục gốc chứa mọi tệp của một tờ trình: Attachments/{yyyyMM}/{dd}/{requestId}, ngày theo giờ Việt Nam.
 * Ngày là ngày tạo tờ trình (nháp chưa có thì lấy ngày hiện tại) để các vòng của cùng một tờ trình nằm chung một thư mục.
 * Tờ trình tạo trước khi có ngày nằm ở Attachments/{requestId}; key đầy đủ của từng tệp lưu trong DB nên hai kiểu cùng tồn tại được.
 */
export function requestFileRoot(requestId: string, createdAt: Date = new Date()): string {
  return `${STORAGE_PATH.ATTACHMENTS}/${monthDayPathVn(createdAt)}/${requestId}`;
}

/** Thư mục tệp người trình tải lên cho một vòng: Attachments/{yyyyMM}/{dd}/{requestId}/round-{n}/{category} */
export function buildRequestFileFolder(requestId: string, round: number, category: RequestFileCategory, createdAt?: Date): string {
  return `${requestFileRoot(requestId, createdAt)}/round-${round}/${category}`;
}

/** Thư mục bản PDF chuyển đổi / đã ký của một vòng: Attachments/{yyyyMM}/{dd}/{requestId}/round-{n}/signed */
export function buildSignedFileFolder(requestId: string, round: number, createdAt?: Date): string {
  return `${requestFileRoot(requestId, createdAt)}/round-${round}/signed`;
}

/**
 * Tệp người trình tải lên cho đúng tờ trình + loại tệp, ở bất kỳ vòng nào
 * (tệp giữ nguyên qua nhiều vòng vẫn nằm ở thư mục vòng đầu; tệp cũ không có ngày, tệp trước khi chia vòng nằm ở .../{requestId}/{category}).
 * Ngày không cần khớp ngày tạo: nháp được presign trước khi tạo phiếu nên có thể lệch một ngày.
 */
export function isRequestFileKey(key: string, requestId: string, category: RequestFileCategory): boolean {
  const id = requestId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${STORAGE_PATH.ATTACHMENTS}/(\\d{6}/\\d{2}/)?${id}/(round-\\d+/)?${category}/[^/]+$`).test(key);
}
