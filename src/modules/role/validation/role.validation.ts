import { PermissionType } from "@common/base/permission-type.enum";
import { z } from "zod";

export const createRoleValidation = z.object({
  name: z.string().min(1, "Role name is required").max(100),
  description: z.string().max(500).optional(),
  rights: z.array(z.nativeEnum(PermissionType)).default([]),
  usersAndGroups: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format")).default([]),
});

export const updateRoleValidation = z.object({
  name: z.string().min(1, "Role name is required").max(100).optional(),
  description: z.string().max(500).optional(),
  rights: z.array(z.nativeEnum(PermissionType)).optional(),
  usersAndGroups: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format")).optional(),
});
