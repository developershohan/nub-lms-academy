"use server";

import { auth } from "@/lib/auth";
import { startQuizAttempt, submitQuizAttempt } from "@/server/services/quiz-attempt-service";

export type ActionState = { error?: string };

// useActionState requires this exact (prevState, formData) signature even though this action needs neither.
export async function startQuizAttemptAction(quizId: string): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const result = await startQuizAttempt(session.user.id, quizId);
  return "error" in result ? { error: result.error } : {};
}

export async function submitQuizAttemptAction(
  attemptId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const result = await submitQuizAttempt(session.user.id, attemptId, formData);
  return "error" in result ? { error: result.error } : {};
}
