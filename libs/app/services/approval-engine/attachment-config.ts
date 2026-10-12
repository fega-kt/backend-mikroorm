import { z } from "zod";

/** Nhóm loại tệp chọn được khi cấu hình — mỗi nhóm ứng với một tập phần mở rộng */
export enum FileKind {
  Pdf = "pdf",
  Word = "word",
  Excel = "excel",
  PowerPoint = "powerpoint",
  Image = "image",
  Zip = "zip",
}

export const FILE_KIND_EXTENSIONS: Record<FileKind, string[]> = {
  [FileKind.Pdf]: ["pdf"],
  [FileKind.Word]: ["doc", "docx"],
  [FileKind.Excel]: ["xls", "xlsx", "csv"],
  [FileKind.PowerPoint]: ["ppt", "pptx"],
  [FileKind.Image]: ["png", "jpg", "jpeg", "gif", "webp"],
  [FileKind.Zip]: ["zip", "rar", "7z"],
};

export const fileBlockConfigSchema = z
  .object({
    /** Ẩn hẳn khối này ở màn tạo tờ trình */
    enabled: z.boolean().default(true),
    required: z.boolean().default(false),
    /** Chỉ có nghĩa khi required = true */
    minFiles: z.number().int().min(0).max(50).default(1),
    maxFiles: z.number().int().min(1).max(50).default(20),
    maxSizeMb: z.number().int().min(1).max(100).default(10),
    fileTypes: z.array(z.enum(FileKind)).min(1).default([FileKind.Pdf, FileKind.Word]),
    hint: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => !v.required || v.minFiles <= v.maxFiles, { message: "minFiles must not exceed maxFiles", path: ["minFiles"] });

export const attachmentConfigSchema = z.object({
  /** Văn bản tờ trình (file chính). Mặc định không bắt buộc để loại tờ trình cũ (chưa cấu hình) vẫn gửi được */
  documents: fileBlockConfigSchema.default(
    fileBlockConfigSchema.parse({ required: false, minFiles: 1, maxFiles: 5, fileTypes: [FileKind.Pdf, FileKind.Word] }),
  ),
  /** Tài liệu đính kèm bổ sung */
  attachments: fileBlockConfigSchema.default(
    fileBlockConfigSchema.parse({
      required: false,
      minFiles: 0,
      maxFiles: 20,
      // mặc định nhận mọi loại để tờ trình cũ (trước khi có cấu hình) vẫn gửi lại được
      fileTypes: Object.values(FileKind),
    }),
  ),
});

export type FileBlockConfig = z.infer<typeof fileBlockConfigSchema>;
export type AttachmentConfig = z.infer<typeof attachmentConfigSchema>;

/** Cấu hình hiệu lực của loại tờ trình (null / thiếu → mặc định) */
export const resolveAttachmentConfig = (raw: unknown): AttachmentConfig => attachmentConfigSchema.parse(raw ?? {});

export interface FileInfo {
  filename: string;
  size: number;
}

export type FileBlockError =
  | { code: "DISABLED" }
  | { code: "MIN_FILES"; min: number }
  | { code: "MAX_FILES"; max: number }
  | { code: "FILE_TYPE"; filename: string }
  | { code: "FILE_SIZE"; filename: string; maxSizeMb: number };

const extOf = (filename: string) => filename.split(".").pop()?.toLowerCase() ?? "";

/** Hàm thuần: kiểm tra danh sách tệp của một khối theo cấu hình */
export function validateFileBlock(config: FileBlockConfig, files: FileInfo[]): FileBlockError[] {
  if (!config.enabled) return files.length ? [{ code: "DISABLED" }] : [];
  const errors: FileBlockError[] = [];
  if (config.required && files.length < Math.max(config.minFiles, 1)) errors.push({ code: "MIN_FILES", min: Math.max(config.minFiles, 1) });
  if (files.length > config.maxFiles) errors.push({ code: "MAX_FILES", max: config.maxFiles });
  const allowed = new Set(config.fileTypes.flatMap((kind) => FILE_KIND_EXTENSIONS[kind]));
  for (const file of files) {
    if (!allowed.has(extOf(file.filename))) errors.push({ code: "FILE_TYPE", filename: file.filename });
    else if (file.size > config.maxSizeMb * 1024 * 1024)
      errors.push({ code: "FILE_SIZE", filename: file.filename, maxSizeMb: config.maxSizeMb });
  }
  return errors;
}
