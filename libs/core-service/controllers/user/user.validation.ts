import { listFilterValidation } from "@common/pagination/pagination.validation";
import { z } from "zod";
import { isValidDate } from "../../services/work-calendar/work-calendar.util";

/** Ngày YYYY-MM-DD; null / "" = xóa giá trị */
const optionalDate = z
  .union([
    z.null(),
    z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v)),
  ])
  .refine((v) => v === null || isValidDate(v), "Date must be YYYY-MM-DD")
  .optional();

/** Hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (so sánh chuỗi đúng thứ tự ngày) */
const todayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/** Ngày sinh: như optionalDate nhưng không được ở tương lai */
const optionalBirthDate = optionalDate.refine((v) => !v || v <= todayVN(), "Birth date cannot be in the future");

export const userListFilterValidation = listFilterValidation.extend({
  fullName: z
    .string()
    .trim()
    .transform((val) => val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .optional(),
  phoneNumber: z
    .string()
    .trim()
    .transform((val) => val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export type UserListFilterDto = z.infer<typeof userListFilterValidation>;

export const createUserValidation = z.object({
  loginName: z.string().trim().min(1, "Email is required").email("Invalid email format"),
  workEmail: z.string().trim().email("Invalid email format").optional(),
  phoneNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9+ ]+$/.test(v), "Invalid phone number format")
    .optional(),
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(255, "Full name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Full name must contain only letters and single spaces between words"),
  avatar: z.string().trim().optional(),
  birthDate: optionalBirthDate,
  joinedDate: optionalDate,
  department: z.string().trim().uuid("Invalid department ID"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(16, "Password must be at most 16 characters")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  isActive: z.boolean().default(true).optional(),
});

export const updateUserValidation = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(255, "Full name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Full name must contain only letters and single spaces between words"),
  workEmail: z
    .union([
      z.null(),
      z
        .string()
        .trim()
        .transform((v) => (v === "" ? null : v))
        .pipe(z.email("Invalid email format").nullable()),
    ])
    .optional(),
  avatar: z.string().trim().optional(),
  phoneNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9+ ]+$/.test(v), "Invalid phone number format")
    .optional(),
  description: z.string().trim().max(1000).optional(),
  birthDate: optionalBirthDate,
  joinedDate: optionalDate,
  department: z.string().trim().uuid("Invalid department ID"),
});

export const updateUserActiveValidation = z.object({
  isActive: z.boolean(),
});

/** Danh sách id cần lấy thông tin hiển thị (một trang tờ trình hiếm khi quá vài chục người) */
export const userBriefsValidation = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
});

export const updateProfileValidation = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(255, "Full name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Full name must contain only letters and single spaces between words"),
  workEmail: z
    .union([
      z.null(),
      z
        .string()
        .trim()
        .transform((v) => (v === "" ? null : v))
        .pipe(z.email("Invalid email format").nullable()),
    ])
    .optional(),
  phoneNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9+ ]+$/.test(v), "Invalid phone number format")
    .optional(),
  description: z.string().trim().max(1000).optional(),
  birthDate: optionalBirthDate,
  // joinedDate cố ý không có ở đây: user không tự sửa ngày vào làm của mình (chỉ admin, xem updateUserValidation)
});
