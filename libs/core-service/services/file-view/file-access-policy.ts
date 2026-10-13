import type { AttachmentEntity } from "../../entities/attachment";

/**
 * Ngữ cảnh mà một tệp được xem trong đó. Mỗi ngữ cảnh có quy tắc phân quyền riêng (xem FileAccessPolicy).
 * Giá trị là `:contextType` trên URL. Thêm loại mới: thêm vào đây + viết policy + đăng ký (xem hướng dẫn ở FileAccessPolicy).
 */
export enum FileContextType {
  /** Tệp của tờ trình — quyền theo quyền xem tờ trình */
  ApprovalRequest = "approval-request",
}

/**
 * Quy tắc "ai được xem tệp nào" của một ngữ cảnh.
 *
 * Thêm ngữ cảnh mới (vd: tệp trong cài đặt):
 *  1. thêm giá trị vào FileContextType;
 *  2. viết một class implements FileAccessPolicy ở domain sở hữu tệp (kiểm quyền theo quy tắc riêng của domain);
 *  3. đăng ký vào module của domain: provider FILE_ACCESS_POLICIES liệt kê class đó.
 *
 * Policy là provider bình thường nên tiêm được service của domain và dùng quyền của người dùng hiện tại.
 */
export interface FileAccessPolicy {
  readonly contextType: FileContextType;

  /**
   * Trả về tệp nếu người dùng hiện tại được xem nó trong ngữ cảnh `refId`
   * (id phiếu, id bản ghi cài đặt…). Không được xem thì ném Forbidden / NotFound.
   */
  resolveFile(refId: string, fileId: string): Promise<AttachmentEntity>;
}

/** Token DI: danh sách policy của app đang chạy (mỗi module domain cung cấp phần của mình) */
export const FILE_ACCESS_POLICIES = Symbol("FILE_ACCESS_POLICIES");
