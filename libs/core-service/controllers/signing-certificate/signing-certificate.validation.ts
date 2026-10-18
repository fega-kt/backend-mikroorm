import { z } from "zod";
import { SigningCertificateStatus } from "../../entities/signing-certificate";

export const pinSchema = z.string().regex(/^\d{6}$/, "PIN must be 6 digits");

/** Ảnh chữ ký tay: data URL PNG/JPEG, tối đa ~200KB */
export const signatureImageSchema = z
  .string()
  .max(280_000)
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "Signature image must be a PNG or JPEG data URL");

export const enrollValidation = z.object({
  pin: pinSchema,
  signatureImage: signatureImageSchema.nullish(),
});

export const changePinValidation = z.object({
  oldPin: z.string().min(1),
  newPin: pinSchema,
});

export const signatureImageValidation = z.object({
  signatureImage: signatureImageSchema.nullable(),
});

export const certificateFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SigningCertificateStatus).optional(),
  search: z.string().trim().optional(),
});

export const reviewNoteValidation = z.object({
  note: z.string().trim().max(1000).optional(),
});

export type EnrollDto = z.infer<typeof enrollValidation>;
export type CertificateFilterDto = z.infer<typeof certificateFilterValidation>;
