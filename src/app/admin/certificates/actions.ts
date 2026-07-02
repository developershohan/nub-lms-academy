"use server";

import { auth } from "@/lib/auth";
import { revokeCertificate } from "@/server/services/certificate-service";

export type ActionState = { error?: string };

export async function revokeCertificateAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const certificateId = formData.get("certificateId") as string;
  const result = await revokeCertificate(session.user.id, certificateId);
  return "error" in result ? { error: result.error } : {};
}
