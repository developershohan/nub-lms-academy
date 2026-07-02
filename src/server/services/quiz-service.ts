import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageCourse } from "@/lib/permissions";
import type { QuestionInput, QuizSettingsInput } from "@/lib/validations/quiz";

function revalidateQuizPaths(courseId: string) {
  revalidatePath(`/teacher/courses/${courseId}/edit`);
}

async function getCourseIdForQuiz(quizId: string) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { courseId: true } });
  return quiz?.courseId;
}

export function listQuizzesForEdit(courseId: string) {
  return prisma.quiz.findMany({
    where: { courseId },
    orderBy: { sortOrder: "asc" },
    include: { questions: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } } },
  });
}

export async function createQuiz(courseId: string, userId: string, title: string) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const last = await prisma.quiz.findFirst({ where: { courseId }, orderBy: { sortOrder: "desc" } });
  const quiz = await prisma.quiz.create({ data: { courseId, title, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  revalidateQuizPaths(courseId);
  return { ok: true, quiz } as const;
}

export async function updateQuizSettings(quizId: string, userId: string, data: QuizSettingsInput) {
  const courseId = await getCourseIdForQuiz(quizId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.quiz.update({
    where: { id: quizId },
    data: {
      title: data.title,
      description: data.description || null,
      passingScore: data.passingScore,
      maxAttempts: data.maxAttempts ?? null,
      timeLimitSec: data.timeLimitSec ?? null,
    },
  });
  revalidateQuizPaths(courseId);
  return { ok: true } as const;
}

export async function deleteQuiz(quizId: string, userId: string) {
  const courseId = await getCourseIdForQuiz(quizId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.quiz.delete({ where: { id: quizId } });
  revalidateQuizPaths(courseId);
  return { ok: true } as const;
}

function buildOptionRows(data: QuestionInput) {
  if (data.type === "TRUE_FALSE") {
    return [
      { content: "True", isCorrect: data.trueFalseAnswer === "true", sortOrder: 0 },
      { content: "False", isCorrect: data.trueFalseAnswer === "false", sortOrder: 1 },
    ];
  }
  return (data.options ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const isCorrect = line.startsWith("*");
      return { content: isCorrect ? line.slice(1).trim() : line, isCorrect, sortOrder: index };
    });
}

function validateOptions(data: QuestionInput, options: ReturnType<typeof buildOptionRows>) {
  if (options.length < 2) return "Add at least two options";
  if (!options.some((o) => o.isCorrect)) return "Mark at least one option as correct";
  if (data.type === "SINGLE_CHOICE" && options.filter((o) => o.isCorrect).length !== 1) {
    return "Single choice questions need exactly one correct option";
  }
  return null;
}

async function getCourseIdForQuestion(questionId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { quiz: { select: { courseId: true } } },
  });
  return question?.quiz.courseId;
}

export async function createQuestion(quizId: string, userId: string, data: QuestionInput) {
  const courseId = await getCourseIdForQuiz(quizId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const options = buildOptionRows(data);
  const optionsError = validateOptions(data, options);
  if (optionsError) return { error: optionsError } as const;

  const last = await prisma.question.findFirst({ where: { quizId }, orderBy: { sortOrder: "desc" } });
  await prisma.question.create({
    data: {
      quizId,
      prompt: data.prompt,
      type: data.type,
      points: data.points,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      options: { create: options },
    },
  });
  revalidateQuizPaths(courseId);
  return { ok: true } as const;
}

export async function updateQuestion(questionId: string, userId: string, data: QuestionInput) {
  const courseId = await getCourseIdForQuestion(questionId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const options = buildOptionRows(data);
  const optionsError = validateOptions(data, options);
  if (optionsError) return { error: optionsError } as const;

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: questionId },
      data: { prompt: data.prompt, type: data.type, points: data.points },
    });
    await tx.questionOption.deleteMany({ where: { questionId } });
    await tx.questionOption.createMany({ data: options.map((o) => ({ ...o, questionId })) });
  });
  revalidateQuizPaths(courseId);
  return { ok: true } as const;
}

export async function deleteQuestion(questionId: string, userId: string) {
  const courseId = await getCourseIdForQuestion(questionId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.question.delete({ where: { id: questionId } });
  revalidateQuizPaths(courseId);
  return { ok: true } as const;
}
