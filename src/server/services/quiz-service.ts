import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { studioHref } from "@/lib/studio";
import { canManageCourse } from "@/lib/permissions";
import type { QuestionInput, QuizSettingsInput } from "@/lib/validations/quiz";

function revalidateQuizPaths(courseId: string) {
  revalidatePath(studioHref(courseId), "layout");
}

async function getCourseIdForQuiz(quizId: string) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { courseId: true } });
  return quiz?.courseId;
}

/** Includes each option's isCorrect flag (the answer key) - unlike the student-facing
 * getQuizForTaking, so ownership must be verified here rather than left to the caller. */
export async function listQuizzesForEdit(userId: string, courseId: string) {
  if (!(await canManageCourse(userId, courseId))) return null;

  return prisma.quiz.findMany({
    where: { courseId, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    include: {
      questions: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
      _count: { select: { attempts: { where: { status: "SUBMITTED" } } } },
    },
  });
}

export async function createQuiz(courseId: string, userId: string, title: string) {
  if (!(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const last = await prisma.quiz.findFirst({ where: { courseId }, orderBy: { sortOrder: "desc" } });
  // New quizzes give partial credit; quizzes from before it existed keep all-or-nothing grading.
  const quiz = await prisma.quiz.create({
    data: { courseId, title, sortOrder: (last?.sortOrder ?? -1) + 1, partialCredit: true },
  });
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
      // Open attempts keep the deadline they started with (QuizAttempt.deadlineAt).
      timeLimitSec: data.timeLimitSec ?? null,
      drawCount: data.drawCount ?? null,
      retakeCooldownMin: data.retakeCooldownMin ?? null,
      shuffleQuestions: !!data.shuffleQuestions,
      shuffleOptions: !!data.shuffleOptions,
      partialCredit: !!data.partialCredit,
    },
  });
  revalidateQuizPaths(courseId);
  return { ok: true } as const;
}

/** A quiz students have taken is archived rather than deleted: it leaves the course (and stops
 * counting toward certificates) but their attempts and scores stay on record. */
export async function deleteQuiz(quizId: string, userId: string) {
  const courseId = await getCourseIdForQuiz(quizId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  const attempts = await prisma.quizAttempt.count({ where: { quizId } });
  if (attempts > 0) {
    await prisma.quiz.update({ where: { id: quizId }, data: { archivedAt: new Date() } });
  } else {
    await prisma.quiz.delete({ where: { id: quizId } });
  }
  revalidateQuizPaths(courseId);
  return { ok: true, archived: attempts > 0 } as const;
}

function buildOptionRows(data: QuestionInput) {
  if (data.type === "TRUE_FALSE") {
    return [
      { content: "True", isCorrect: data.trueFalseAnswer === "true", sortOrder: 0 },
      { content: "False", isCorrect: data.trueFalseAnswer === "false", sortOrder: 1 },
    ];
  }
  // Blanks list accepted answers and ordering lists items in the right order: every line counts.
  const allCorrect = data.type === "FILL_BLANK" || data.type === "ORDERING";
  return (data.options ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const starred = line.startsWith("*");
      return { content: starred ? line.slice(1).trim() : line, isCorrect: allCorrect || starred, sortOrder: index };
    })
    .filter((o) => o.content !== "");
}

function validateOptions(data: QuestionInput, options: ReturnType<typeof buildOptionRows>) {
  if (data.type === "FILL_BLANK") return options.length > 0 ? null : "Add at least one accepted answer";
  if (data.type === "ORDERING") return options.length >= 2 ? null : "Add at least two items to put in order";
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

/** Past attempts keep their own copy of the question (QuizAttempt.snapshot), so deleting it here
 * never touches anyone's results. */
export async function deleteQuestion(questionId: string, userId: string) {
  const courseId = await getCourseIdForQuestion(questionId);
  if (!courseId || !(await canManageCourse(userId, courseId))) return { error: "Forbidden" } as const;

  await prisma.question.delete({ where: { id: questionId } });
  revalidateQuizPaths(courseId);
  return { ok: true } as const;
}
