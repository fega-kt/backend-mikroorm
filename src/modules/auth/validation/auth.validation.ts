import { z } from "zod";

export const sendLoginOtpValidation = z.object({
  email: z.email("Invalid email address"),
});

export const loginWithOtpValidation = z.object({
  email: z.email("Invalid email address"),
  otp: z.string().trim().length(6, "OTP must be 6 digits"),
});

export const forgotPasswordValidation = z.object({
  email: z.email("Invalid email address"),
});

export const verifyOtpValidation = z.object({
  email: z.email("Invalid email address"),
  otp: z.string().trim().length(6, "OTP must be 6 digits"),
});

export const changePasswordValidation = z
  .object({
    oldPassword: z
      .string()
      .min(8, "Old password must be at least 8 characters")
      .max(16, "Old password must be at most 16 characters")
      .regex(/[a-z]/, "Old password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Old password must contain at least one number")
      .regex(/[A-Z]/, "Old password must contain at least one uppercase letter"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(16, "Password must be at most 16 characters")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter"),
  })
  .refine((data) => data.oldPassword !== data.newPassword, {
    message: "New password must be different from old password",
    path: ["newPassword"],
  });
