"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { learnHref, lessonPosition } from "@/lib/learning-path";
import { lessonNoteSchema, lessonViewSchema, progressSchema } from "@/lib/validations/learning";
import { getCourseForLearning } from "@/server/services/course-service";
import { saveLessonNote } from "@/server/services/lesson-note-service";
import { getCourseProgress, recordLessonProgress, recordLessonView } from "@/server/services/progress-service";

export type ActionState = { error?: string };

/** Marks the lesson done and moves on to the next one, Udemy-style. The student stays on the
 * lesson when it was the last one, or when it finished the course - the page then shows what's
 * left, or the course-complete state, right where they clicked. */
export async function markLessonCompleteAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const parsed = progressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const lessonId = formData.get("lessonId") as string;
  const result = await recordLessonProgress(session.user.id, lessonId, parsed.data.watchedSeconds, true);
  if ("error" in result) return { error: result.error };

  const [course, progress] = await Promise.all([
    getCourseForLearning(result.courseId),
    getCourseProgress(session.user.id, result.courseId),
  ]);
  const next = course ? lessonPosition(course.sections, lessonId)?.next : null;
  if (next && !progress.isComplete) redirect(learnHref(result.courseId, next.id));
  return {};
}

export async function recordLessonViewAction(lessonId: string): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const parsed = lessonViewSchema.safeParse({ lessonId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await recordLessonView(session.user.id, parsed.data.lessonId);
  return "error" in result ? { error: result.error } : {};
}

export type SaveNoteResult = { ok: true; savedAt: string | null } | { error: string };

export async function saveLessonNoteAction(input: { lessonId: string; content: string }): Promise<SaveNoteResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Your session has ended. Sign in again to save notes." };

  const parsed = lessonNoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await saveLessonNote(session.user.id, parsed.data.lessonId, parsed.data.content);
  if ("error" in result) return { error: "You can't save notes on this lesson." };
  return { ok: true, savedAt: result.note?.updatedAt.toISOString() ?? null };
}
