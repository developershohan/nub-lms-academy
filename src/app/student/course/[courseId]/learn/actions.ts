"use server";

import { auth } from "@/lib/auth";
import { progressSchema } from "@/lib/validations/learning";
import { recordLessonProgress } from "@/server/services/progress-service";

export type ActionState = { error?: string };

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
  return "error" in result ? { error: result.error } : {};
}
