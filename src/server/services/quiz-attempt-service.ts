import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessCourse } from "@/lib/permissions";
import { attemptBlock, canRevealAnswers, isPastDeadline, quizDeadline } from "@/lib/quiz-rules";
import {
  buildAttemptSnapshot,
  gradeAttempt,
  publicQuestion,
  readResponses,
  type AttemptSnapshot,
  type QuestionResponse,
} from "@/lib/quiz-grading";
import type { Prisma } from "@/generated/prisma/client";

const QUESTIONS_IN_ORDER = {
  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  include: { options: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
} satisfies Prisma.QuestionFindManyArgs;

export function listQuizzesForCourse(courseId: string) {
  return prisma.quiz.findMany({
    where: { courseId, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, title: true, lessonId: true, _count: { select: { questions: true } } },
  });
}

/** Quizzes in the course the student has passed at least once. */
export async function listPassedQuizIds(userId: string, courseId: string) {
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, status: "SUBMITTED", passed: true, quiz: { courseId } },
    select: { quizId: true },
    distinct: ["quizId"],
  });
  return new Set(attempts.map((a) => a.quizId));
}

/** The quiz's settings and bank size for its intro page - no questions; those come per attempt. */
export async function getQuizForTaking(userId: string, quizId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { course: { select: { id: true, title: true } }, _count: { select: { questions: true } } },
  });
  if (!quiz || !(await canAccessCourse(userId, quiz.courseId))) return null;
  const bankSize = quiz._count.questions;
  return { ...quiz, bankSize, questionsPerAttempt: quiz.drawCount ? Math.min(quiz.drawCount, bankSize) : bankSize };
}

type AttemptWithQuiz = Prisma.QuizAttemptGetPayload<{ include: { quiz: true } }>;

/** Attempts started before quiz v2 have no stored deadline: fall back to the quiz's current limit. */
function deadlineOf(attempt: AttemptWithQuiz) {
  return attempt.deadlineAt ?? quizDeadline(attempt.startedAt, attempt.quiz.timeLimitSec);
}

/** The attempt's questions - its snapshot, or for attempts from before snapshots existed, the quiz's
 * current questions in quiz order (the best record there is of what they were shown). */
async function snapshotOf(attempt: AttemptWithQuiz): Promise<AttemptSnapshot> {
  if (attempt.snapshot) return attempt.snapshot as unknown as AttemptSnapshot;
  const questions = await prisma.question.findMany({ where: { quizId: attempt.quizId }, ...QUESTIONS_IN_ORDER });
  return buildAttemptSnapshot(questions, { shuffleQuestions: false, shuffleOptions: false, drawCount: null });
}

async function savedResponses(attemptId: string) {
  const rows = await prisma.quizAnswer.findMany({ where: { attemptId } });
  return new Map<string, QuestionResponse>(
    rows.map((r) => [r.questionId, { selectedOptionIds: r.selectedOptionIds, textAnswer: r.textAnswer }])
  );
}

/**
 * The one place an attempt gets graded and closed. The IN_PROGRESS -> SUBMITTED flip is the guard:
 * a conditional update inside the transaction, so a double submit, or a submit racing the server's
 * own auto-submit, grades the attempt exactly once. Returns null if something else closed it first.
 */
async function finalizeAttempt(attempt: AttemptWithQuiz, responses: Map<string, QuestionResponse>, auto: boolean) {
  const snapshot = await snapshotOf(attempt);
  const graded = gradeAttempt(snapshot, responses, attempt.quiz);

  const closed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.quizAttempt.updateMany({
      where: { id: attempt.id, status: "IN_PROGRESS" },
      data: {
        status: "SUBMITTED",
        score: graded.score,
        passed: graded.passed,
        pointsEarned: graded.pointsEarned,
        pointsPossible: graded.pointsPossible,
        autoSubmitted: auto,
        submittedAt: new Date(),
        // Keep the questions this attempt was graded on, even for attempts that predate snapshots.
        ...(attempt.snapshot ? {} : { snapshot: snapshot as unknown as Prisma.InputJsonValue }),
      },
    });
    if (count === 0) return false;
    await tx.quizAnswer.deleteMany({ where: { attemptId: attempt.id } });
    await tx.quizAnswer.createMany({ data: graded.answers.map((a) => ({ ...a, attemptId: attempt.id })) });
    return true;
  });
  // No revalidatePath here: pages call this while rendering (an attempt found past its deadline),
  // and Next.js forbids revalidating during render. The actions below revalidate for themselves.
  return closed ? graded : null;
}

/** Time ran out: grade whatever the student had saved. Answers can't arrive any more. */
async function autoSubmit(attempt: AttemptWithQuiz) {
  return finalizeAttempt(attempt, await savedResponses(attempt.id), true);
}

/**
 * The open attempt with its questions (no answer key) and saved answers, or null. One that is past
 * its deadline is auto-submitted here, so no page or action ever resumes an attempt whose time is
 * up. `remainingMs` (null without a time limit) drives the countdown - time left rather than a
 * deadline, so it doesn't depend on the student's clock.
 */
export async function getInProgressAttempt(userId: string, quizId: string) {
  const attempt = await prisma.quizAttempt.findFirst({
    where: { userId, quizId, status: "IN_PROGRESS" },
    include: { quiz: true },
  });
  if (!attempt) return null;
  const deadline = deadlineOf(attempt);
  if (isPastDeadline(deadline)) {
    await autoSubmit(attempt);
    return null;
  }
  const [snapshot, saved] = await Promise.all([snapshotOf(attempt), savedResponses(attempt.id)]);
  return {
    id: attempt.id,
    remainingMs: deadline ? Math.max(0, deadline.getTime() - Date.now()) : null,
    questions: snapshot.questions.map(publicQuestion),
    saved: Object.fromEntries(saved),
  };
}

export function listAttemptHistory(userId: string, quizId: string) {
  return prisma.quizAttempt.findMany({
    where: { userId, quizId, status: "SUBMITTED" },
    orderBy: { submittedAt: "desc" },
  });
}

/** Whether a new attempt can start, and if not, why - for the quiz page and startQuizAttempt alike. */
export async function getAttemptEligibility(userId: string, quizId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { maxAttempts: true, retakeCooldownMin: true, archivedAt: true, _count: { select: { questions: true } } },
  });
  if (!quiz) return null;
  const [submittedAttempts, last] = await Promise.all([
    prisma.quizAttempt.count({ where: { userId, quizId, status: "SUBMITTED" } }),
    prisma.quizAttempt.findFirst({
      where: { userId, quizId, status: "SUBMITTED" },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true },
    }),
  ]);
  const block = quiz.archivedAt
    ? ({ reason: "archived" } as const)
    : quiz._count.questions === 0
      ? ({ reason: "no-questions" } as const)
      : attemptBlock({
          maxAttempts: quiz.maxAttempts,
          submittedAttempts,
          lastSubmittedAt: last?.submittedAt ?? null,
          cooldownMin: quiz.retakeCooldownMin,
        });
  return {
    block,
    submittedAttempts,
    attemptsLeft: quiz.maxAttempts == null ? null : Math.max(0, quiz.maxAttempts - submittedAttempts),
    // Worked out here rather than in the page: render must not read the clock.
    cooldownMinutesLeft:
      block?.reason === "cooldown" ? Math.max(1, Math.ceil((block.availableAt.getTime() - Date.now()) / 60_000)) : null,
  };
}

const START_ERRORS = {
  archived: "This quiz is no longer available",
  "no-questions": "This quiz has no questions yet",
  "no-attempts-left": "You've used all of your attempts for this quiz",
  cooldown: "You can retake this quiz after the cooldown",
} as const;

/**
 * Resumes the open attempt, or starts one: questions drawn and shuffled into a snapshot, and a
 * deadline fixed from the time limit. A per-student lock serialises double clicks, which would
 * otherwise open two attempts - and the spare one would later auto-submit and burn an attempt.
 */
export async function startQuizAttempt(userId: string, quizId: string) {
  const existing = await getInProgressAttempt(userId, quizId);
  if (existing) return { ok: true, attemptId: existing.id } as const;

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: QUESTIONS_IN_ORDER } });
  if (!quiz || !(await canAccessCourse(userId, quiz.courseId))) return { error: "Not found" } as const;
  const eligibility = await getAttemptEligibility(userId, quizId);
  if (eligibility?.block) return { error: START_ERRORS[eligibility.block.reason] } as const;

  const now = new Date();
  const snapshot = buildAttemptSnapshot(quiz.questions, quiz);
  const attemptId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quiz-attempt:${userId}:${quizId}`}))`;
    const open = await tx.quizAttempt.findFirst({ where: { userId, quizId, status: "IN_PROGRESS" }, select: { id: true } });
    if (open) return open.id;
    const created = await tx.quizAttempt.create({
      data: {
        quizId,
        userId,
        startedAt: now,
        deadlineAt: quizDeadline(now, quiz.timeLimitSec),
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    return created.id;
  });
  revalidatePath(`/student/quiz/${quizId}`);
  return { ok: true, attemptId } as const;
}

async function getOwnOpenAttempt(userId: string, attemptId: string) {
  const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId }, include: { quiz: true } });
  if (!attempt || attempt.userId !== userId) return { attempt: null, error: "Not found" } as const;
  if (attempt.status === "SUBMITTED") return { attempt: null, error: "This attempt was already submitted" } as const;
  return { attempt, error: null } as const;
}

/**
 * Autosave while the student works. Answers stop being accepted at the deadline (plus grace); after
 * that the attempt is auto-submitted from what was saved. The attempt row is locked while answers
 * are replaced, so a save can't land on top of a submit that is grading the same attempt.
 */
export async function saveQuizAnswers(userId: string, attemptId: string, form: FormData) {
  const { attempt, error } = await getOwnOpenAttempt(userId, attemptId);
  if (attempt === null) return { error } as const;
  if (isPastDeadline(deadlineOf(attempt))) {
    await autoSubmit(attempt);
    revalidatePath(`/student/quiz/${attempt.quizId}`);
    return { error: "Time's up - your saved answers were submitted" } as const;
  }

  const responses = readResponses(await snapshotOf(attempt), form);
  const saved = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM "QuizAttempt" WHERE id = ${attemptId} FOR UPDATE`;
    if (row?.status !== "IN_PROGRESS") return false;
    await tx.quizAnswer.deleteMany({ where: { attemptId } });
    await tx.quizAnswer.createMany({
      data: [...responses].map(([questionId, r]) => ({ attemptId, questionId, ...r })),
    });
    return true;
  });
  return saved ? ({ ok: true } as const) : ({ error: "This attempt was already submitted" } as const);
}

/**
 * The student's own submit. On time, it grades exactly what was sent; once the deadline (plus
 * grace) has passed, what was sent is ignored and the attempt is graded from saved answers.
 */
export async function submitQuizAttempt(userId: string, attemptId: string, form: FormData) {
  const { attempt, error } = await getOwnOpenAttempt(userId, attemptId);
  if (attempt === null) return { error } as const;

  const late = isPastDeadline(deadlineOf(attempt));
  const graded = late
    ? await autoSubmit(attempt)
    : await finalizeAttempt(attempt, readResponses(await snapshotOf(attempt), form), false);
  if (!graded) return { error: "This attempt was already submitted" } as const;
  revalidatePath(`/student/quiz/${attempt.quizId}`);
  return { ok: true, quizId: attempt.quizId, score: graded.score, passed: graded.passed, late } as const;
}

/**
 * A submitted attempt, question by question from its snapshot. The answer key is only included
 * once it can't help on a later attempt (see canRevealAnswers) - showing it after every failed
 * attempt handed out the answers for the next one.
 */
export async function getAttemptResult(userId: string, attemptId: string) {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: true, answers: true },
  });
  if (!attempt || attempt.userId !== userId || attempt.status !== "SUBMITTED") return null;

  const [submittedAttempts, passedAttempt, snapshot] = await Promise.all([
    prisma.quizAttempt.count({ where: { userId, quizId: attempt.quizId, status: "SUBMITTED" } }),
    prisma.quizAttempt.findFirst({
      where: { userId, quizId: attempt.quizId, status: "SUBMITTED", passed: true },
      select: { id: true },
    }),
    snapshotOf(attempt),
  ]);
  const revealAnswers = canRevealAnswers({
    hasPassed: !!passedAttempt,
    maxAttempts: attempt.quiz.maxAttempts,
    submittedAttempts,
  });
  const answers = new Map(attempt.answers.map((a) => [a.questionId, a]));

  return {
    id: attempt.id,
    quizId: attempt.quizId,
    title: attempt.quiz.title,
    score: attempt.score ?? 0,
    passed: !!attempt.passed,
    passingScore: attempt.quiz.passingScore,
    pointsEarned: attempt.pointsEarned,
    pointsPossible: attempt.pointsPossible,
    autoSubmitted: attempt.autoSubmitted,
    submittedAt: attempt.submittedAt,
    revealAnswers,
    questions: snapshot.questions.map((question) => {
      const answer = answers.get(question.id);
      return {
        ...publicQuestion(question),
        selectedOptionIds: answer?.selectedOptionIds ?? [],
        textAnswer: answer?.textAnswer ?? null,
        isCorrect: answer?.isCorrect ?? false,
        pointsAwarded: answer?.pointsAwarded ?? 0,
        answerKey: revealAnswers
          ? {
              correctOptionIds: question.options.filter((o) => o.isCorrect).map((o) => o.id),
              correctOrder: question.correctOrder ?? null,
              acceptedAnswers: question.type === "FILL_BLANK" ? question.options.map((o) => o.content) : null,
            }
          : null,
      };
    }),
  };
}

export type AttemptResult = NonNullable<Awaited<ReturnType<typeof getAttemptResult>>>;
