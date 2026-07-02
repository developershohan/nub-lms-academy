"use server";

import { registerSchema } from "@/lib/validations/auth";
import { registerUser } from "@/server/services/auth-service";

export type RegisterState = { error?: string; success?: boolean };

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const result = await registerUser(parsed.data);
  if ("error" in result) return { error: result.error };
  return { success: true };
}
