import { describe, expect, it } from "vitest";
import { QUIZ_SUBMIT_GRACE_MS, attemptBlock, canRevealAnswers, isAttemptExpired, quizDeadline } from "./quiz-rules";

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

describe("attemptBlock", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const minutesBefore = (m: number) => new Date(now.getTime() - m * 60_000);
  const base = { maxAttempts: 3, submittedAttempts: 1, lastSubmittedAt: minutesBefore(5), cooldownMin: null };

  it("allows a retake with attempts left and no cooldown", () => {
    expect(attemptBlock(base, now)).toBeNull();
  });

  it("blocks once every attempt is used", () => {
    expect(attemptBlock({ ...base, submittedAttempts: 3 }, now)).toEqual({ reason: "no-attempts-left" });
  });

  it("blocks during the cooldown and says when it ends", () => {
    expect(attemptBlock({ ...base, cooldownMin: 30 }, now)).toEqual({
      reason: "cooldown",
      availableAt: new Date(minutesBefore(5).getTime() + 30 * 60_000),
    });
    expect(attemptBlock({ ...base, cooldownMin: 5 }, new Date(now.getTime() + 1))).toBeNull();
  });

  it("has nothing to wait for before the first attempt", () => {
    expect(attemptBlock({ ...base, submittedAttempts: 0, lastSubmittedAt: null, cooldownMin: 60 }, now)).toBeNull();
  });
});
