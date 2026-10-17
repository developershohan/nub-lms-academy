import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  canAccessCourse: vi.fn().mockResolvedValue(true),
  canAttemptQuiz: vi.fn().mockResolvedValue(true),
}));

import { prisma as prismaClient } from "@/lib/prisma";
import { getAttemptResult, startQuizAttempt, submitQuizAttempt } from "./quiz-attempt-service";

const prisma = prismaClient as unknown as PrismaMock;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const quiz = {
  id: "quiz-1",
  passingScore: 50,
  maxAttempts: 3,
  timeLimitSec: 600,
  questions: [{ id: "q1", points: 1, options: [{ id: "a", isCorrect: true }, { id: "b", isCorrect: false }] }],
};

beforeEach(() => prisma.$reset());

describe("submitQuizAttempt", () => {
  it("refuses to grade answers submitted after the time limit and closes the attempt with 0", async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: "attempt-1",
      userId: "student-1",
      quizId: "quiz-1",
      status: "IN_PROGRESS",
      startedAt: minutesAgo(30),
      quiz,
    });
    const answers = new FormData();
    answers.append("q_q1", "a"); // correct - but too late

    const result = await submitQuizAttempt("student-1", "attempt-1", answers);

    expect(result).toHaveProperty("error");
    expect(prisma.quizAnswer.createMany).not.toHaveBeenCalled();
    expect(prisma.quizAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: "attempt-1", status: "IN_PROGRESS" },
      data: { status: "SUBMITTED", score: 0, passed: false, submittedAt: expect.any(Date) },
    });
  });

  const openAttempt = {
    id: "attempt-1",
    userId: "student-1",
    quizId: "quiz-1",
    status: "IN_PROGRESS",
    startedAt: minutesAgo(5),
    quiz,
  };

  it("grades an on-time submission", async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue(openAttempt);
    prisma.quizAttempt.updateMany.mockResolvedValue({ count: 1 });
    const answers = new FormData();
    answers.append("q_q1", "a");

    await expect(submitQuizAttempt("student-1", "attempt-1", answers)).resolves.toEqual({
      ok: true,
      score: 100,
      passed: true,
    });
    expect(prisma.quizAnswer.createMany).toHaveBeenCalledTimes(1);
  });

  it("answers a concurrent duplicate submit cleanly instead of failing on the unique constraint", async () => {
    // Both requests read IN_PROGRESS; the first one's transaction already flipped it.
    prisma.quizAttempt.findUnique.mockResolvedValue(openAttempt);
    prisma.quizAttempt.updateMany.mockResolvedValue({ count: 0 });
    const answers = new FormData();
    answers.append("q_q1", "a");

    await expect(submitQuizAttempt("student-1", "attempt-1", answers)).resolves.toEqual({
      error: "This attempt was already submitted",
    });
    expect(prisma.quizAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "attempt-1", status: "IN_PROGRESS" } })
    );
    expect(prisma.quizAnswer.createMany).not.toHaveBeenCalled();
  });
});

describe("startQuizAttempt", () => {
  it("closes an expired open attempt instead of resuming it, then starts a fresh one", async () => {
    prisma.quizAttempt.findFirst.mockResolvedValue({
      id: "stale",
      status: "IN_PROGRESS",
      startedAt: minutesAgo(60),
      quiz: { timeLimitSec: 600 },
    });
    prisma.quizAttempt.create.mockResolvedValue({ id: "fresh" });

    await expect(startQuizAttempt("student-1", "quiz-1")).resolves.toEqual({ ok: true, attemptId: "fresh" });
    expect(prisma.quizAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "stale", status: "IN_PROGRESS" } })
    );
  });
});

describe("getAttemptResult", () => {
  beforeEach(() => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: "attempt-1",
      userId: "student-1",
      quizId: "quiz-1",
      status: "SUBMITTED",
      quiz,
      answers: [],
    });
  });

  it("does not reveal correct answers after a failed attempt with attempts left", async () => {
    prisma.quizAttempt.count.mockResolvedValue(1);
    prisma.quizAttempt.findFirst.mockResolvedValue(null);
    expect((await getAttemptResult("student-1", "attempt-1"))?.revealAnswers).toBe(false);
  });

  it("reveals correct answers on the final attempt", async () => {
    prisma.quizAttempt.count.mockResolvedValue(3);
    prisma.quizAttempt.findFirst.mockResolvedValue(null);
    expect((await getAttemptResult("student-1", "attempt-1"))?.revealAnswers).toBe(true);
  });
});
