import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessCourse, canAttemptQuiz } from "@/lib/permissions";
import { canRevealAnswers, isAttemptExpired, quizDeadline } from "@/lib/quiz-rules";

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

/** An attempt left open past its time limit (+ grace) is closed as a failed, zero-score
 * submission. Answers sent after the deadline aren't graded - otherwise the time limit is only
 * enforced by the browser, and a student could keep the attempt open and look answers up. */
async function closeExpiredAttempt(attemptId: string) {
  await prisma.quizAttempt.updateMany({
    where: { id: attemptId, status: "IN_PROGRESS" },
    data: { status: "SUBMITTED", score: 0, passed: false, submittedAt: new Date() },
  });
}

/** The open attempt, if any - an expired one is closed here (see closeExpiredAttempt) so the quiz
 * page and startQuizAttempt never resume an attempt whose time has run out. `remainingMs` (null
 * without a time limit) drives the countdown; sending time left rather than a deadline keeps it
 * independent of the student's clock. */
export async function getInProgressAttempt(userId: string, quizId: string) {
  const attempt = await prisma.quizAttempt.findFirst({
    where: { userId, quizId, status: "IN_PROGRESS" },
    include: { quiz: { select: { timeLimitSec: true } } },
  });
  if (!attempt) return null;
  if (isAttemptExpired(attempt.startedAt, attempt.quiz.timeLimitSec)) {
    await closeExpiredAttempt(attempt.id);
    return null;
  }
  const deadline = quizDeadline(attempt.startedAt, attempt.quiz.timeLimitSec);
  return { ...attempt, remainingMs: deadline ? Math.max(0, deadline.getTime() - Date.now()) : null };
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
  if (isAttemptExpired(attempt.startedAt, attempt.quiz.timeLimitSec)) {
    await closeExpiredAttempt(attemptId);
    revalidatePath(`/student/quiz/${attempt.quizId}`);
    return { error: "Time's up - this attempt went past the time limit and was recorded with a score of 0" } as const;
  }

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

  // The IN_PROGRESS -> SUBMITTED flip is the guard, so it's a conditional update inside the
  // transaction: a double-click or retried request used to pass the status check above twice, and
  // the second insert then hit QuizAnswer's (attemptId, questionId) unique constraint as a 500.
  const claimed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.quizAttempt.updateMany({
      where: { id: attemptId, status: "IN_PROGRESS" },
      data: { status: "SUBMITTED", score, passed, submittedAt: new Date() },
    });
    if (count === 0) return false;
    await tx.quizAnswer.createMany({ data: answerRows.map((a) => ({ ...a, attemptId })) });
    return true;
  });
  if (!claimed) return { error: "This attempt was already submitted" } as const;

  revalidatePath(`/student/quiz/${attempt.quizId}`);
  return { ok: true, score, passed } as const;
}

/** `revealAnswers` says whether the page may show which options were correct (see
 * canRevealAnswers) - showing them after every failed attempt handed out the answer key for the
 * next one. */
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

  const [submittedAttempts, passedAttempt] = await Promise.all([
    prisma.quizAttempt.count({ where: { userId, quizId: attempt.quizId, status: "SUBMITTED" } }),
    prisma.quizAttempt.findFirst({
      where: { userId, quizId: attempt.quizId, status: "SUBMITTED", passed: true },
      select: { id: true },
    }),
  ]);
  const revealAnswers = canRevealAnswers({
    hasPassed: !!passedAttempt,
    maxAttempts: attempt.quiz.maxAttempts,
    submittedAttempts,
  });
  return { ...attempt, revealAnswers };
}
