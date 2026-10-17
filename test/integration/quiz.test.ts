import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { QUIZ_SUBMIT_GRACE_MS } from "@/lib/quiz-rules";
import type { AttemptSnapshot } from "@/lib/quiz-grading";
import {
  getAttemptEligibility,
  getAttemptResult,
  getInProgressAttempt,
  saveQuizAnswers,
  startQuizAttempt,
  submitQuizAttempt,
} from "@/server/services/quiz-attempt-service";
import { createQuestion, deleteQuestion, deleteQuiz, updateQuestion } from "@/server/services/quiz-service";
import { createCourse, createUser, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
});

type QuizOptions = Partial<{
  timeLimitSec: number;
  maxAttempts: number;
  drawCount: number;
  retakeCooldownMin: number;
  partialCredit: boolean;
  passingScore: number;
}>;

/** A teacher's course with one quiz, and an enrolled student. */
async function setup(options: QuizOptions = {}) {
  const teacher = await createUser(["TEACHER"]);
  const student = await createUser();
  const course = await createCourse(teacher.id);
  await prisma.enrollment.create({ data: { userId: student.id, courseId: course.id, source: "PURCHASE" } });
  const quiz = await prisma.quiz.create({ data: { courseId: course.id, title: "Checkpoint", passingScore: 50, ...options } });
  const add = async (prompt: string, type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "FILL_BLANK" | "ORDERING", lines: string, points = 1) => {
    const result = await createQuestion(quiz.id, teacher.id, { prompt, type, points, options: lines });
    expect(result).toEqual({ ok: true });
    return prisma.question.findFirstOrThrow({ where: { quizId: quiz.id, prompt }, include: { options: { orderBy: { sortOrder: "asc" } } } });
  };
  return { teacher, student, course, quiz, add };
}

/** Builds the form a student would post, from option contents rather than ids. */
async function formFor(attemptId: string, answers: Record<string, string[]>) {
  const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const snapshot = attempt.snapshot as unknown as AttemptSnapshot;
  const form = new FormData();
  for (const [prompt, values] of Object.entries(answers)) {
    const question = snapshot.questions.find((q) => q.prompt === prompt)!;
    for (const value of values) {
      const option = question.options.find((o) => o.content === value);
      form.append(`q_${question.id}`, question.type === "FILL_BLANK" ? value : option!.id);
    }
  }
  return form;
}

async function expireAttempt(attemptId: string) {
  await prisma.quizAttempt.update({
    where: { id: attemptId },
    data: { deadlineAt: new Date(Date.now() - QUIZ_SUBMIT_GRACE_MS - 1000) },
  });
}

describe("grading", () => {
  it("grades every question type, with partial credit where the quiz allows it", async () => {
    const { student, quiz, add } = await setup({ partialCredit: true });
    await add("Pick the hooks", "MULTIPLE_CHOICE", "*useState\n*useEffect\nrender", 2);
    await add("Capital of France", "FILL_BLANK", "Paris");
    await add("Order the steps", "ORDERING", "Plan\nBuild\nShip");

    const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    const form = await formFor(attemptId, {
      "Pick the hooks": ["useState"], // one of two: half the points
      "Capital of France": ["  paris "],
      "Order the steps": ["Ship", "Plan", "Build"], // one pair of two in sequence: half
    });

    const result = await submitQuizAttempt(student.id, attemptId, form);
    expect(result).toMatchObject({ ok: true, score: 63, passed: true, late: false });

    const saved = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true } });
    expect(saved).toMatchObject({ status: "SUBMITTED", pointsEarned: 2.5, pointsPossible: 4, autoSubmitted: false });
    expect(saved.answers.map((a) => a.pointsAwarded).sort()).toEqual([0.5, 1, 1]);
  });

  it("grades a double submit exactly once", async () => {
    const { student, quiz, add } = await setup();
    await add("Capital of France", "FILL_BLANK", "Paris");
    const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    const form = await formFor(attemptId, { "Capital of France": ["Paris"] });

    const results = await Promise.all([submitQuizAttempt(student.id, attemptId, form), submitQuizAttempt(student.id, attemptId, form)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ error: "This attempt was already submitted" });
    expect(await prisma.quizAnswer.count({ where: { attemptId } })).toBe(1);
  });
});

describe("the timer", () => {
  it("fixes the deadline when the attempt starts", async () => {
    const { student, quiz, add } = await setup({ timeLimitSec: 600 });
    await add("Capital of France", "FILL_BLANK", "Paris");
    const before = Date.now();
    const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    await prisma.quiz.update({ where: { id: quiz.id }, data: { timeLimitSec: 60 } });

    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.deadlineAt!.getTime() - before).toBeGreaterThanOrEqual(600_000 - 1000);
    expect((await getInProgressAttempt(student.id, quiz.id))?.remainingMs).toBeGreaterThan(590_000);
  });

  it("auto-submits the saved answers once time is up, without anyone pressing submit", async () => {
    const { student, quiz, add } = await setup({ timeLimitSec: 600 });
    await add("Capital of France", "FILL_BLANK", "Paris");
    await add("Capital of Spain", "FILL_BLANK", "Madrid");
    const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    await expect(saveQuizAnswers(student.id, attemptId, await formFor(attemptId, { "Capital of France": ["Paris"] }))).resolves.toEqual({
      ok: true,
    });

    await expireAttempt(attemptId);
    expect(await getInProgressAttempt(student.id, quiz.id)).toBeNull();

    await expect(prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId } })).resolves.toMatchObject({
      status: "SUBMITTED",
      autoSubmitted: true,
      score: 50,
      passed: true,
    });
  });

  it("ignores answers sent after the deadline and grades what was saved", async () => {
    const { student, quiz, add } = await setup({ timeLimitSec: 600 });
    await add("Capital of France", "FILL_BLANK", "Paris");
    const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    await expireAttempt(attemptId);

    const late = await submitQuizAttempt(student.id, attemptId, await formFor(attemptId, { "Capital of France": ["Paris"] }));
    expect(late).toMatchObject({ ok: true, late: true, score: 0 });
    await expect(saveQuizAnswers(student.id, attemptId, new FormData())).resolves.toEqual({
      error: "This attempt was already submitted",
    });
  });

  it("refuses to save answers once the attempt is past its deadline", async () => {
    const { student, quiz, add } = await setup({ timeLimitSec: 600 });
    await add("Capital of France", "FILL_BLANK", "Paris");
    const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    await expireAttempt(attemptId);

    const result = await saveQuizAnswers(student.id, attemptId, await formFor(attemptId, { "Capital of France": ["Paris"] }));
    expect(result).toEqual({ error: "Time's up - your saved answers were submitted" });
    await expect(prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId } })).resolves.toMatchObject({ score: 0 });
  });
});

describe("attempts", () => {
  it("opens one attempt when two starts race", async () => {
    // A double click can reach two server processes. Play the first on its own connection: it holds
    // the student's start lock and has inserted an attempt it hasn't committed yet. The second start
    // must wait for it and resume that attempt - not open a spare one that would later auto-submit
    // and burn one of the student's attempts.
    const { student, quiz, add } = await setup();
    await add("Capital of France", "FILL_BLANK", "Paris");
    const otherProcess = new Client({ connectionString: process.env.DATABASE_URL });
    await otherProcess.connect();
    await otherProcess.query("BEGIN");
    await otherProcess.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`quiz-attempt:${student.id}:${quiz.id}`]);
    await otherProcess.query(
      `INSERT INTO "QuizAttempt" (id, "quizId", "userId", status) VALUES ('first', $1, $2, 'IN_PROGRESS')`,
      [quiz.id, student.id]
    );

    const second = startQuizAttempt(student.id, quiz.id);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await otherProcess.query("COMMIT");
    await otherProcess.end();

    await expect(second).resolves.toEqual({ ok: true, attemptId: "first" });
    expect(await prisma.quizAttempt.count({ where: { quizId: quiz.id } })).toBe(1);
  });

  it("draws a fresh random set from the bank for each attempt", async () => {
    const { student, quiz, add } = await setup({ drawCount: 2 });
    for (const n of [1, 2, 3, 4, 5, 6]) await add(`Question ${n}`, "FILL_BLANK", "x");

    const draws = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
      const attempt = await getInProgressAttempt(student.id, quiz.id);
      expect(attempt?.questions).toHaveLength(2);
      draws.add(attempt!.questions.map((q) => q.prompt).sort().join());
      await submitQuizAttempt(student.id, attemptId, new FormData());
    }
    expect(draws.size).toBeGreaterThan(1);
  });

  it("makes the student wait out the cooldown between attempts", async () => {
    const { student, quiz, add } = await setup({ retakeCooldownMin: 30 });
    await add("Capital of France", "FILL_BLANK", "Paris");
    const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    await submitQuizAttempt(student.id, attemptId, new FormData());

    await expect(startQuizAttempt(student.id, quiz.id)).resolves.toEqual({
      error: "You can retake this quiz after the cooldown",
    });
    expect((await getAttemptEligibility(student.id, quiz.id))?.block).toMatchObject({ reason: "cooldown" });

    await prisma.quizAttempt.update({ where: { id: attemptId }, data: { submittedAt: new Date(Date.now() - 31 * 60_000) } });
    await expect(startQuizAttempt(student.id, quiz.id)).resolves.toMatchObject({ ok: true });
  });

  it("shows the answer key only after a pass or the last attempt", async () => {
    const { student, quiz, add } = await setup({ maxAttempts: 2, passingScore: 100 });
    await add("Capital of France", "FILL_BLANK", "Paris");

    const first = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    await submitQuizAttempt(student.id, first.attemptId, await formFor(first.attemptId, { "Capital of France": ["Lyon"] }));
    expect((await getAttemptResult(student.id, first.attemptId))?.questions[0].answerKey).toBeNull();

    const second = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    await submitQuizAttempt(student.id, second.attemptId, await formFor(second.attemptId, { "Capital of France": ["Nice"] }));
    expect((await getAttemptResult(student.id, first.attemptId))?.questions[0].answerKey).toMatchObject({
      acceptedAnswers: ["Paris"],
    });
  });
});

describe("history", () => {
  it("survives edits and deletes of the quiz's questions", async () => {
    const { teacher, student, quiz, add } = await setup();
    const question = await add("Pick the hooks", "SINGLE_CHOICE", "*useState\nrender");
    const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    await submitQuizAttempt(student.id, attemptId, await formFor(attemptId, { "Pick the hooks": ["useState"] }));

    // The teacher rewrites the question (new option rows), then deletes it.
    await updateQuestion(question.id, teacher.id, { prompt: "Pick a hook", type: "SINGLE_CHOICE", points: 5, options: "render\n*useMemo" });
    await deleteQuestion(question.id, teacher.id);

    const result = await getAttemptResult(student.id, attemptId);
    expect(result).toMatchObject({ score: 100, passed: true });
    expect(result?.questions[0]).toMatchObject({ prompt: "Pick the hooks", points: 1, isCorrect: true, pointsAwarded: 1 });
    expect(result?.questions[0].options.map((o) => o.content)).toEqual(["useState", "render"]);
  });

  it("archives a quiz students have taken instead of deleting their attempts", async () => {
    const { teacher, student, quiz, add } = await setup();
    await add("Capital of France", "FILL_BLANK", "Paris");
    const { attemptId } = (await startQuizAttempt(student.id, quiz.id)) as { attemptId: string };
    await submitQuizAttempt(student.id, attemptId, new FormData());

    await expect(deleteQuiz(quiz.id, teacher.id)).resolves.toEqual({ ok: true, archived: true });
    await expect(prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id } })).resolves.toMatchObject({ archivedAt: expect.any(Date) });
    expect(await getAttemptResult(student.id, attemptId)).not.toBeNull();
    await expect(startQuizAttempt(student.id, quiz.id)).resolves.toEqual({ error: "This quiz is no longer available" });
  });
});
