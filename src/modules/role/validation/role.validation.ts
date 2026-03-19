import { PermissionType } from "@common/base/permission-type.enum";
import { z } from "zod";

export const createRoleValidation = z.object({
  name: z.string().min(1, "Role name is required").max(100),
  description: z.string().max(500).optional(),
  rights: z.array(z.nativeEnum(PermissionType)).min(1, "Role must have at least one permission"),
  usersAndGroups: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID format")),
});
