"use server";

import { resetPasswordSchema } from "@/lib/validations/auth";
import { resetPassword } from "@/server/services/auth-service";

export type ResetPasswordState = { error?: string; success?: boolean };

export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const result = await resetPassword(parsed.data.email, parsed.data);
  if ("error" in result) return { error: result.error };
  return { success: true };
}
