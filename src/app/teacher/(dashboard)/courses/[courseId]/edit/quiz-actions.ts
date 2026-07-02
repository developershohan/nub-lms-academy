"use server";

import { auth } from "@/lib/auth";
import { quizSettingsSchema, questionSchema } from "@/lib/validations/quiz";
import {
  createQuiz,
  updateQuizSettings,
  deleteQuiz,
  createQuestion,
  updateQuestion,
  deleteQuestion,
} from "@/server/services/quiz-service";

export type ActionState = { error?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function createQuizAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const title = formData.get("title") as string;
  if (!title || title.trim().length < 3) return { error: "Title must be at least 3 characters" };

  const result = await createQuiz(courseId, userId, title);
  return "error" in result ? { error: result.error } : {};
}

export async function updateQuizSettingsAction(
  quizId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = quizSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await updateQuizSettings(quizId, userId, parsed.data);
  return "error" in result ? { error: result.error } : {};
}

export async function deleteQuizAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const quizId = formData.get("quizId") as string;
  const result = await deleteQuiz(quizId, userId);
  return "error" in result ? { error: result.error } : {};
}

export async function createQuestionAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = questionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const quizId = formData.get("quizId") as string;
  const result = await createQuestion(quizId, userId, parsed.data);
  return "error" in result ? { error: result.error } : {};
}

export async function updateQuestionAction(
  questionId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = questionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await updateQuestion(questionId, userId, parsed.data);
  return "error" in result ? { error: result.error } : {};
}

export async function deleteQuestionAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const questionId = formData.get("questionId") as string;
  const result = await deleteQuestion(questionId, userId);
  return "error" in result ? { error: result.error } : {};
}
