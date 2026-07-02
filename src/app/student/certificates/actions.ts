"use server";

import { auth } from "@/lib/auth";
import { generateCertificate } from "@/server/services/certificate-service";

export type ActionState = { error?: string };

export async function generateCertificateAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const result = await generateCertificate(session.user.id, courseId);
  return "error" in result ? { error: result.error } : {};
}
