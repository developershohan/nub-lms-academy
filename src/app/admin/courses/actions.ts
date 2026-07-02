"use server";

import { auth } from "@/lib/auth";
import { rejectCourseSchema } from "@/lib/validations/course";
import {
  approveCourse,
  rejectCourse,
  publishCourse,
  unpublishCourse,
  setCourseSubscriptionIncluded,
} from "@/server/services/course-service";

export type ActionState = { error?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function approveCourseAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const result = await approveCourse(userId, courseId);
  return "error" in result ? { error: result.error } : {};
}

export async function rejectCourseAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const parsed = rejectCourseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await rejectCourse(userId, courseId, parsed.data.reason);
  return "error" in result ? { error: result.error } : {};
}

export async function publishCourseAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const result = await publishCourse(userId, courseId);
  return "error" in result ? { error: result.error } : {};
}

export async function unpublishCourseAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const result = await unpublishCourse(userId, courseId);
  return "error" in result ? { error: result.error } : {};
}

export async function includeInSubscriptionAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const result = await setCourseSubscriptionIncluded(userId, courseId, true);
  return "error" in result ? { error: result.error } : {};
}

export async function excludeFromSubscriptionAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const result = await setCourseSubscriptionIncluded(userId, courseId, false);
  return "error" in result ? { error: result.error } : {};
}
