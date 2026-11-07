import { EXPORT_LANGS } from "@core-service/services/export/export.util";
import { z } from "zod";

/** Khóa tài nguyên: service tự kiểm có trong sổ đăng ký của nơi chạy không (không thì 404) */
export const exportResourceValidation = z.string().trim().min(1).max(64);

/**
 * Chuẩn bị xuất: `filter` là đúng bộ lọc danh sách đang xem (server tự kiểm theo từng danh sách, bỏ qua page / limit),
 * `columns` là cột đang hiển thị kèm nhãn đã dịch (khóa phải thuộc danh sách cho phép; bỏ trống = mọi cột).
 * `sendEmail`: chỉ có tác dụng khi dữ liệu lớn chạy nền — gửi email (kèm file nếu đủ nhỏ) tới chính người yêu cầu khi xong.
 */
export const prepareExportValidation = z.object({
  filter: z.record(z.string(), z.unknown()).default({}),
  columns: z
    .array(z.object({ key: z.string().trim().min(1).max(64), header: z.string().max(200).optional() }))
    .max(50)
    .optional(),
  lang: z.enum(EXPORT_LANGS).default("vi-VN"),
  sendEmail: z.boolean().default(false),
});

export const exportJobListValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PrepareExportDto = z.infer<typeof prepareExportValidation>;
export type ExportJobListDto = z.infer<typeof exportJobListValidation>;
