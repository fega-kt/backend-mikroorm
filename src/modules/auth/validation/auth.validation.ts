import { z } from "zod";

export const forgotPasswordValidation = z.object({
  email: z.email("Invalid email address"),
});

export const verifyOtpValidation = z.object({
  email: z.email("Invalid email address"),
  otp: z.string().trim().length(6, "OTP must be 6 digits"),
});

export const changePasswordValidation = z
  .object({
    oldPassword: z.string().min(1, "Old password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter"),
  })
  .refine((data) => data.oldPassword !== data.newPassword, {
    message: "New password must be different from old password",
    path: ["newPassword"],
  });
