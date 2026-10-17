import { describe, expect, it } from "vitest";
import { QUIZ_SUBMIT_GRACE_MS, canRevealAnswers, isAttemptExpired, quizDeadline } from "./quiz-rules";

const startedAt = new Date("2026-10-17T10:00:00Z");
const at = (ms: number) => new Date(startedAt.getTime() + ms);

describe("isAttemptExpired", () => {
  it("allows a submission within the limit plus the network grace period", () => {
    expect(isAttemptExpired(startedAt, 600, at(600_000 + QUIZ_SUBMIT_GRACE_MS))).toBe(false);
  });

  it("rejects a submission after the limit plus grace", () => {
    expect(isAttemptExpired(startedAt, 600, at(600_000 + QUIZ_SUBMIT_GRACE_MS + 1))).toBe(true);
  });

  it("treats null and the legacy 0 (saved from a blank field) as no time limit", () => {
    expect(quizDeadline(startedAt, null)).toBeNull();
    expect(quizDeadline(startedAt, 0)).toBeNull();
    expect(isAttemptExpired(startedAt, 0, at(10 * 24 * 3600_000))).toBe(false);
  });
});

describe("canRevealAnswers", () => {
  it("hides answers after a failed attempt while attempts remain", () => {
    expect(canRevealAnswers({ hasPassed: false, maxAttempts: 3, submittedAttempts: 1 })).toBe(false);
    expect(canRevealAnswers({ hasPassed: false, maxAttempts: null, submittedAttempts: 10 })).toBe(false);
  });

  it("reveals answers after a pass or once the last attempt is used", () => {
    expect(canRevealAnswers({ hasPassed: true, maxAttempts: null, submittedAttempts: 1 })).toBe(true);
    expect(canRevealAnswers({ hasPassed: false, maxAttempts: 3, submittedAttempts: 3 })).toBe(true);
  });
});
