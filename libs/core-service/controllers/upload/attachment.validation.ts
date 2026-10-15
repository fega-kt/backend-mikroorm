import { STORAGE_PATH } from "@common/constants/storage.constant";
import { z } from "zod";
import { MULTIPART_MAX_PARTS } from "../../services/upload/upload.constants";

const validPaths = Object.values(STORAGE_PATH);

export const uploadAttachmentValidation = z.object({
  path: z.string({ error: "path is required" }).refine((val) => validPaths.some((p) => val.startsWith(p)), {
    message: `path must start with one of: ${validPaths.join(", ")}`,
  }),
});

/** Hoàn tất upload; file upload nhiều phần gửi kèm uploadId và ETag của từng phần */
export const completeAttachmentValidation = z
  .object({
    uploadId: z.string().min(1).max(1024),
    parts: z
      .array(z.object({ partNumber: z.number().int().min(1).max(10000), etag: z.string().min(1).max(256) }))
      .min(1)
      .max(MULTIPART_MAX_PARTS),
  })
  .optional();
