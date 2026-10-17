"use server";

import { headers } from "next/headers";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { clientIp } from "@/lib/rate-limit";
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

  const result = await resetPassword(parsed.data.email, parsed.data, { ip: clientIp(await headers()) });
  if ("error" in result) return { error: result.error };
  return { success: true };
}
