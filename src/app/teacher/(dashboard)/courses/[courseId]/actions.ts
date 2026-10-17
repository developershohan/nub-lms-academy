"use server";

import { auth } from "@/lib/auth";
import {
  courseGoalsSchema,
  courseLandingSchema,
  coursePricingSchema,
  lessonSchema,
  moveSchema,
  sectionSchema,
} from "@/lib/validations/course";
import {
  updateCourseLanding,
  updateCourseGoals,
  updateCoursePricing,
  submitCourseForReview,
  createSection,
  updateSection,
  deleteSection,
  createLesson,
  updateLesson,
  deleteLesson,
  moveSection,
  moveLesson,
} from "@/server/services/course-service";

export type ActionState = { error?: string; success?: boolean };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function updateCourseLandingAction(
  courseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = courseLandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await updateCourseLanding(courseId, userId, parsed.data);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function updateCourseGoalsAction(
  courseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  // The lists arrive as one form field per item.
  const parsed = courseGoalsSchema.safeParse({
    outcomes: formData.getAll("outcomes"),
    requirements: formData.getAll("requirements"),
    targetAudience: formData.get("targetAudience") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await updateCourseGoals(courseId, userId, parsed.data);
  return "error" in result ? { error: result.error } : { success: true };
}

export async function updateCoursePricingAction(
  courseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = coursePricingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await updateCoursePricing(courseId, userId, parsed.data);
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

/** Curriculum reordering buttons - one click each, so there is no form state to report back. */
export async function moveSectionAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const parsed = moveSchema.safeParse(Object.fromEntries(formData));
  if (!userId || !parsed.success) return;
  await moveSection(parsed.data.id, userId, parsed.data.direction);
}

export async function moveLessonAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const parsed = moveSchema.safeParse(Object.fromEntries(formData));
  if (!userId || !parsed.success) return;
  await moveLesson(parsed.data.id, userId, parsed.data.direction);
}
