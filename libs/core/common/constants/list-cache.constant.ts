import { ENV } from "@config/env.config";

/** Prefix cache danh sách của từng entity — phải khớp BaseService.cachePrefix (tên entity viết thường, bỏ "Entity") */
export const LIST_CACHE = {
  CATEGORY: "category",
  FORM: "form",
  REQUEST_TYPE: "requesttype",
  APPROVAL_WORKFLOW: "approvalworkflow",
  DEPARTMENT: "department",
  USER: "user",
  GROUP: "group",
  ROLE: "role",
  PRINCIPAL: "principal",
  APP_SETTING: "appsetting",
} as const;

/**
 * Phiên bản cache list, nằm trong key: mỗi bản deploy đọc key mới nên không trả dữ liệu theo dạng response cũ;
 * local không có commit thì đổi theo mỗi lần khởi động. Key cũ tự hết hạn, lệnh xóa `list:*` vẫn bắt được.
 */
export const LIST_CACHE_VERSION = ENV.GIT_COMMIT?.slice(0, 8) ?? `boot-${Date.now().toString(36)}`;

/** TTL (giây) cache danh sách; cache được xóa khi ghi nên TTL chỉ là lưới an toàn */
export const LIST_CACHE_TTL = {
  /** Danh mục ít đổi */
  STATIC: 6 * 3600,
  /** Dữ liệu đổi thường hơn hoặc phụ thuộc nhiều bảng */
  DYNAMIC: 3600,
  /** Request có từ khóa tìm kiếm: nhiều key ít dùng lại, để hết hạn sớm cho đỡ tốn bộ nhớ */
  SEARCH: 600,
} as const;
