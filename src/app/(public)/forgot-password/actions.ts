"use server";

import { forgotPasswordSchema } from "@/lib/validations/auth";
import { requestPasswordReset } from "@/server/services/auth-service";

export type ForgotPasswordState = { error?: string; sent?: boolean };

export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  await requestPasswordReset(parsed.data.email);
  return { sent: true };
}
