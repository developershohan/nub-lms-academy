"use server";

import { auth } from "@/lib/auth";
import { courseDetailsSchema, sectionSchema, lessonSchema } from "@/lib/validations/course";
import {
  updateCourseDetails,
  submitCourseForReview,
  createSection,
  updateSection,
  deleteSection,
  createLesson,
  updateLesson,
  deleteLesson,
} from "@/server/services/course-service";

export type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function updateCourseDetailsAction(
  courseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = courseDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await updateCourseDetails(courseId, userId, parsed.data);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function submitForReviewAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const result = await submitCourseForReview(courseId, userId);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function createSectionAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const parsed = sectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await createSection(courseId, userId, parsed.data.title);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function updateSectionAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const sectionId = formData.get("sectionId") as string;
  const parsed = sectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await updateSection(sectionId, userId, parsed.data.title);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function deleteSectionAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const sectionId = formData.get("sectionId") as string;
  const result = await deleteSection(sectionId, userId);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function createLessonAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const sectionId = formData.get("sectionId") as string;
  const parsed = lessonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await createLesson(sectionId, userId, parsed.data);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function updateLessonAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const lessonId = formData.get("lessonId") as string;
  const parsed = lessonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await updateLesson(lessonId, userId, parsed.data);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function deleteLessonAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const lessonId = formData.get("lessonId") as string;
  const result = await deleteLesson(lessonId, userId);
  return "error" in result ? { error: result.error } : { success: true };
}
