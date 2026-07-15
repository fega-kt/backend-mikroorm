import { z } from "zod";
import { AppSettingType } from "../../entities/app-setting";

export const upsertAppSettingValidation = z.object({
  key: z.nativeEnum(AppSettingType),
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
  description: z.string().optional(),
});
