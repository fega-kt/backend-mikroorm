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

/** Thư mục lưu tệp của một tờ trình: Attachments/{requestId}/{category} */
export function buildRequestFileFolder(requestId: string, category: RequestFileCategory): string {
  return `${STORAGE_PATH.ATTACHMENTS}/${requestId}/${category}`;
}
