import { STORAGE_PATH } from "@common/constants/storage.constant";
import { z } from "zod";

const validPaths = Object.values(STORAGE_PATH);

export const uploadAttachmentValidation = z.object({
  path: z.string({ error: "path is required" }).refine((val) => validPaths.some((p) => val.startsWith(p)), {
    message: `path must start with one of: ${validPaths.join(", ")}`,
  }),
});
