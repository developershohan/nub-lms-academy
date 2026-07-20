"use server";

import { auth } from "@/lib/auth";
import { assignByEmailSchema } from "@/lib/validations/common";
import { addSubInstructorByEmail, removeSubInstructor } from "@/server/services/course-instructor-service";
import { enrollUserByEmail } from "@/server/services/enrollment-service";

export type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function addSubInstructorAction(
  courseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = assignByEmailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await addSubInstructorByEmail(userId, courseId, parsed.data.email);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function removeSubInstructorAction(courseId: string, targetUserId: string) {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" } as const;
  return removeSubInstructor(userId, courseId, targetUserId);
}

export async function enrollStudentAction(
  courseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = assignByEmailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await enrollUserByEmail(userId, courseId, parsed.data.email);
  return "error" in result ? { error: result.error } : { success: true };
}
