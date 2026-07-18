"use server";

import { auth } from "@/lib/auth";
import { updateProfileSchema, changeEmailSchema, changePasswordSchema } from "@/lib/validations/profile";
import { updateProfile, changeEmail, changePassword } from "@/server/services/user-service";
import { resendVerificationEmail } from "@/server/services/auth-service";

export type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function updateProfileAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = updateProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await updateProfile(userId, parsed.data);
  return { success: true };
}

export async function changeEmailAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = changeEmailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await changeEmail(userId, parsed.data.email, parsed.data.currentPassword);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function changePasswordAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await changePassword(userId, parsed.data.currentPassword, parsed.data.newPassword);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function resendOwnVerificationAction() {
  const session = await auth();
  if (!session?.user?.email) return;
  await resendVerificationEmail(session.user.email);
}
