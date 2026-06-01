import { listFilterValidation } from "@common/pagination/pagination.validation";
import z from "zod";
import { DepartmentStatus } from "../entity/department.entity";

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

export const createDepartmentValidation = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Code must be less than 50 characters")
    .regex(/^[a-zA-Z]+$/, "Code must contain only letters (a-z, A-Z)")
    .transform((v) => v.toUpperCase()),
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters")
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Name must contain only letters and single spaces between words"),
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
    .regex(/^[\p{L}]+(?:\s[\p{L}]+)*$/u, "Name must contain only letters and single spaces between words")
    .optional(),
  parent: z.string().optional().nullable(),
  manager: z.string().optional().nullable(),
  deputy: z.string().optional().nullable(),
  status: z.nativeEnum(DepartmentStatus).optional().default(DepartmentStatus.ACTIVE),
});
