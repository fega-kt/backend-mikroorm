export const STORAGE_PATH = {
  USER_AVATAR: "UserAvatars",
  ATTACHMENTS: "Attachments",
  PROJECT: "Projects",
  CATEGORY: "Categories",
  /** Ảnh chữ ký tay của chứng thư ký số */
  SIGNATURE_IMAGES: "SignatureImages",
} as const;

/** Các thư mục chỉ lưu ở bucket private (không có URL công khai) */
const PRIVATE_STORAGE_PATHS: readonly string[] = [STORAGE_PATH.ATTACHMENTS, STORAGE_PATH.SIGNATURE_IMAGES];

/** Đường dẫn upload có thuộc nhóm tài liệu private không (dựa theo thư mục gốc) */
export function isPrivateStoragePath(path: string): boolean {
  return PRIVATE_STORAGE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}
