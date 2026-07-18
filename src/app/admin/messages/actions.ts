"use server";

import { auth } from "@/lib/auth";
import { createUserSchema } from "@/lib/validations/admin";
import { assignByEmailSchema } from "@/lib/validations/common";
import { createUserByAdmin } from "@/server/services/user-service";
import { enrollUserByEmail } from "@/server/services/enrollment-service";

export type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function createUserAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const autoVerify = formData.get("autoVerify") === "on";
  const result = await createUserByAdmin(userId, { ...parsed.data, autoVerify });
  return "error" in result ? { error: result.error } : { success: true };
}

export async function assignUserToCourseAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId");
  if (typeof courseId !== "string" || !courseId) return { error: "Choose a course" };

  const parsed = assignByEmailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await enrollUserByEmail(userId, courseId, parsed.data.email);
  return "error" in result ? { error: result.error } : { success: true };
}
