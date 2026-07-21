import { listFilterValidation } from "@common/pagination/pagination.validation";
import z from "zod";
import { DepartmentStatus } from "../../entities/department";

const searchStringSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .optional();

export const departmentListFilterValidation = listFilterValidation.extend({
  name: searchStringSchema,
  code: searchStringSchema,
  status: z.coerce.number().pipe(z.nativeEnum(DepartmentStatus)).optional(),
});

export type DepartmentListFilterDto = z.infer<typeof departmentListFilterValidation>;

export const departmentUsersFilterValidation = listFilterValidation;

export type DepartmentUsersFilterDto = z.infer<typeof departmentUsersFilterValidation>;

export const createDepartmentValidation = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code must be less than 50 characters")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)*$/,
      "Code must start with a letter, contain only letters, numbers, and single underscores (not consecutive)",
    )
    .transform((v) => v.toUpperCase()),
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters")
    .regex(
      /^[\p{L}][\p{L}0-9]*(?:\s[\p{L}0-9]+)*$/u,
      "Name must start with a letter and contain only letters, numbers, and single spaces between words",
    ),
  parent: z.string().optional().nullable(),
  manager: z.string().optional().nullable(),
  deputy: z.string().optional().nullable(),
  status: z.nativeEnum(DepartmentStatus).optional().default(DepartmentStatus.ACTIVE),
});

export const updateDepartmentValidation = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters")
    .regex(
      /^[\p{L}][\p{L}0-9]*(?:\s[\p{L}0-9]+)*$/u,
      "Name must start with a letter and contain only letters, numbers, and single spaces between words",
    ),
  parent: z.string().optional().nullable(),
  manager: z.string().optional().nullable(),
  deputy: z.string().optional().nullable(),
  status: z.nativeEnum(DepartmentStatus).optional().default(DepartmentStatus.ACTIVE),
});
