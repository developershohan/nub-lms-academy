"use server";

import { auth } from "@/lib/auth";
import { approveTeacherApplication, rejectTeacherApplication } from "@/server/services/teacher-service";

export type ReviewState = { error?: string };

export async function approveTeacherAction(
  _prevState: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const teacherId = formData.get("teacherId") as string;
  const result = await approveTeacherApplication(session.user.id, teacherId);
  return "error" in result ? { error: result.error } : {};
}

export async function rejectTeacherAction(
  _prevState: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const teacherId = formData.get("teacherId") as string;
  const result = await rejectTeacherApplication(session.user.id, teacherId);
  return "error" in result ? { error: result.error } : {};
}
