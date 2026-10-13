import { STORAGE_PATH } from "@common/constants/storage.constant";
import { z } from "zod";

const validPaths = Object.values(STORAGE_PATH);

export const downloadUrlQueryValidation = z.object({
  disposition: z.enum(["inline", "attachment"]).default("attachment"),
});

export const presignUploadValidation = z.object({
  path: z.string({ error: "path is required" }).refine((val) => validPaths.some((p) => val.startsWith(p)), {
    message: `path must start with one of: ${validPaths.join(", ")}`,
  }),
  filename: z.string().trim().min(1).max(255),
  mimetype: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
});

export const uploadAttachmentValidation = z.object({
  path: z.string({ error: "path is required" }).refine((val) => validPaths.some((p) => val.startsWith(p)), {
    message: `path must start with one of: ${validPaths.join(", ")}`,
  }),
});
