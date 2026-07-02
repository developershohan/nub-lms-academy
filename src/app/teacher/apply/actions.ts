"use server";

import { auth } from "@/lib/auth";
import { applyForTeacher } from "@/server/services/teacher-service";

export type ApplyTeacherState = { error?: string; status?: string };

// useActionState requires this exact (prevState, formData) signature even though this action needs neither.
export async function applyTeacherAction(): Promise<ApplyTeacherState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const result = await applyForTeacher(session.user.id);
  if ("error" in result) return { error: result.error };
  return { status: result.status };
}
