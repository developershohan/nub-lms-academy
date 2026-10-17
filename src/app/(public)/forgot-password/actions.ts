"use server";

import { headers } from "next/headers";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { clientIp } from "@/lib/rate-limit";
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

  const result = await requestPasswordReset(parsed.data.email, { ip: clientIp(await headers()) });
  if ("error" in result) return { error: result.error };
  return { sent: true };
}
