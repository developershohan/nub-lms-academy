"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { saveQuizAnswers, startQuizAttempt, submitQuizAttempt } from "@/server/services/quiz-attempt-service";

export type ActionState = { error?: string };

// useActionState requires this exact (prevState, formData) signature even though this action needs neither.
export async function startQuizAttemptAction(quizId: string): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const result = await startQuizAttempt(session.user.id, quizId);
  return "error" in result ? { error: result.error } : {};
}

/** Autosave from the attempt form. `expired` tells the form time ran out and it should move on. */
export async function saveQuizAnswersAction(
  attemptId: string,
  formData: FormData
): Promise<{ ok?: true; error?: string; expired?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const result = await saveQuizAnswers(session.user.id, attemptId, formData);
  if (result.error) return { error: result.error, expired: result.error.startsWith("Time's up") };
  return { ok: true };
}

export async function submitQuizAttemptAction(
  attemptId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const result = await submitQuizAttempt(session.user.id, attemptId, formData);
  if (!result.ok) return { error: result.error };
  redirect(`/student/quiz/${result.quizId}/attempts/${attemptId}`);
}
