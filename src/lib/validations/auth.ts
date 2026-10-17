import { z } from "zod";

/** Accounts are stored under a lowercase email so "Rahim@Gmail.com" and "rahim@gmail.com" can't
 * become two different accounts - every lookup by a user-typed email should normalise the same way. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const normalizedEmail = z.string().trim().toLowerCase().email("Enter a valid email");

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: normalizedEmail,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
