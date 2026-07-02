import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessCourse, canAttemptQuiz } from "@/lib/permissions";

export function listQuizzesForCourse(courseId: string) {
  return prisma.quiz.findMany({
    where: { courseId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, title: true, _count: { select: { questions: true } } },
  });
}

/** Questions/options only - never the `isCorrect` flags - safe to show while an attempt is open. */
export async function getQuizForTaking(userId: string, quizId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" }, select: { id: true, content: true } } },
      },
    },
  });
  if (!quiz) return null;
  if (!(await canAccessCourse(userId, quiz.courseId))) return null;
  return quiz;
}

export async function getInProgressAttempt(userId: string, quizId: string) {
  return prisma.quizAttempt.findFirst({ where: { userId, quizId, status: "IN_PROGRESS" } });
}

export function listAttemptHistory(userId: string, quizId: string) {
  return prisma.quizAttempt.findMany({
    where: { userId, quizId, status: "SUBMITTED" },
    orderBy: { submittedAt: "desc" },
  });
}

export async function startQuizAttempt(userId: string, quizId: string) {
  const existing = await getInProgressAttempt(userId, quizId);
  if (existing) return { ok: true, attemptId: existing.id } as const;

  if (!(await canAttemptQuiz(userId, quizId))) {
    return { error: "You can't start a new attempt right now" } as const;
  }

  const attempt = await prisma.quizAttempt.create({ data: { quizId, userId } });
  revalidatePath(`/student/quiz/${quizId}`);
  return { ok: true, attemptId: attempt.id } as const;
}

export async function submitQuizAttempt(userId: string, attemptId: string, formData: FormData) {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { include: { questions: { include: { options: true } } } } },
  });
  if (!attempt || attempt.userId !== userId) return { error: "Not found" } as const;
  if (attempt.status === "SUBMITTED") return { error: "This attempt was already submitted" } as const;

  let earnedPoints = 0;
  let totalPoints = 0;
  const answerRows = attempt.quiz.questions.map((question) => {
    totalPoints += question.points;
    const selected = formData.getAll(`q_${question.id}`).map(String).sort();
    const correctIds = question.options
      .filter((o) => o.isCorrect)
      .map((o) => o.id)
      .sort();
    const isCorrect =
      correctIds.length === selected.length && correctIds.every((id, i) => id === selected[i]);
    if (isCorrect) earnedPoints += question.points;
    return { questionId: question.id, selectedOptionIds: selected, isCorrect };
  });

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = score >= attempt.quiz.passingScore;

  await prisma.$transaction([
    prisma.quizAnswer.createMany({ data: answerRows.map((a) => ({ ...a, attemptId })) }),
    prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { status: "SUBMITTED", score, passed, submittedAt: new Date() },
    }),
  ]);

  revalidatePath(`/student/quiz/${attempt.quizId}`);
  return { ok: true, score, passed } as const;
}

export async function getAttemptResult(userId: string, attemptId: string) {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      quiz: true,
      answers: {
        include: { question: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
      },
    },
  });
  if (!attempt || attempt.userId !== userId) return null;
  return attempt;
}
