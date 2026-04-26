import { ProjectMemberRole } from "../entity/project-member.entity";
import { z } from "zod";

export const addProjectMemberValidation = z.object({
  userId: z.string().trim().min(1, "User is required"),
  role: z.nativeEnum(ProjectMemberRole).default(ProjectMemberRole.MEMBER),
});

export const updateProjectMemberValidation = z.object({
  role: z.nativeEnum(ProjectMemberRole),
});
