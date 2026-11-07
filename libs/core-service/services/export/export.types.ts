import type { PermissionType } from "@common/base/permission-type.enum";
import type { EntityManager } from "@mikro-orm/core";
import type { ZodType } from "zod";
import type { ExportColumn, ExportLang } from "./export.util";

/** Một lượt đọc dữ liệu của một danh sách với bộ lọc + người dùng + thời điểm chốt đã cho */
export interface ExportScope<T> {
  /** Số dòng khớp */
  count: () => Promise<number>;
  /** Lô kế tiếp: các dòng có id lớn hơn `afterId`, theo id tăng dần, tối đa `limit` dòng */
  fetch: (afterId: string | null, limit: number) => Promise<T[]>;
}

/** Người yêu cầu xuất (phần cần để xét quyền lúc chuẩn bị) */
export interface ExportUser {
  id: string;
  department?: { id: string } | null;
  canAccess: (permissions: PermissionType[]) => boolean;
}

/**
 * Định nghĩa xuất Excel của một danh sách. Thuần: chỉ nhận `em` + tham số, không đọc gì từ request — nên cùng một định nghĩa
 * chạy được ở route tải ngay (công khai theo vé) lẫn ở worker chạy nền (không có request).
 */
export interface ExportDefinition<T extends { id: string } = { id: string }> {
  /** Khóa trong đường dẫn API và trong bản ghi job */
  resource: string;
  /** Cần có tất cả các quyền này mới xuất được */
  permissions: PermissionType[];
  /** Schema bộ lọc của danh sách tương ứng (page / limit bị bỏ qua) */
  filterSchema: ZodType;
  columns: ExportColumn<T>[];
  /** Tên sheet và tên file (gốc, chưa kèm ngày) theo ngôn ngữ */
  title: Record<ExportLang, string>;
  /**
   * Xét quyền riêng của danh sách lúc chuẩn bị (có người đăng nhập): ném lỗi nếu không được xuất, và trả về "phạm vi quyền"
   * dạng dữ liệu thuần (vd: xem toàn hệ thống hay chỉ phòng ban nào) để chốt vào vé / job — worker không có quyền của người dùng
   * nên không tự tính lại được. `filter` là bộ lọc đã kiểm hợp lệ.
   */
  resolveScope?: (user: ExportUser, filter: unknown) => unknown;
  /**
   * Mở phạm vi đọc dữ liệu. `filter` là bộ lọc GỐC như client gửi (mỗi định nghĩa tự parse đúng một lần — không parse lại giá trị đã
   * chuyển đổi); `scope` là kết quả của `resolveScope`. Điều kiện lọc phải dùng đúng hàm của danh sách để hai nơi không lệch nhau.
   */
  open: (em: EntityManager, filter: unknown, userId: string, cutoff: Date, scope?: unknown) => Promise<ExportScope<T>>;
}

/** Sổ đăng ký chứa định nghĩa của nhiều loại dòng: xóa kiểu dòng ở đúng một chỗ này */
export const eraseRowType = <T extends { id: string }>(definition: ExportDefinition<T>): ExportDefinition<never> =>
  definition as unknown as ExportDefinition<never>;

/** Mọi thứ cần để dựng file, chốt lúc chuẩn bị — dùng cho vé tải ngay và cho bản ghi job chạy nền */
export interface ExportRequestSnapshot {
  resource: string;
  userId: string;
  /** Bộ lọc gốc như client gửi */
  filter: unknown;
  /** Phạm vi quyền đã chốt lúc chuẩn bị (kết quả của resolveScope) */
  scope?: unknown;
  columns: { key: string; header?: string }[] | undefined;
  lang: ExportLang;
  /** ISO; chỉ lấy dòng tạo trước thời điểm này */
  cutoff: string;
  filename: string;
  total: number;
}
