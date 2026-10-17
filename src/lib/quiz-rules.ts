/** Slack between the student's countdown reaching zero (which auto-submits the form) and the
 * server receiving that submission over a slow connection. */
export const QUIZ_SUBMIT_GRACE_MS = 30_000;

/** When an attempt's time runs out, or null for no limit. A 0 limit also means "no limit": that's
 * what a blank time-limit field used to be saved as, so it must never mean "already expired". */
export function quizDeadline(startedAt: Date, timeLimitSec: number | null | undefined): Date | null {
  if (!timeLimitSec || timeLimitSec <= 0) return null;
  return new Date(startedAt.getTime() + timeLimitSec * 1000);
}

/** Past the deadline and its grace: the server stops taking answers and grades what was saved. */
export function isPastDeadline(deadline: Date | null, now = new Date()) {
  return deadline !== null && now.getTime() > deadline.getTime() + QUIZ_SUBMIT_GRACE_MS;
}

export function isAttemptExpired(startedAt: Date, timeLimitSec: number | null | undefined, now = new Date()) {
  return isPastDeadline(quizDeadline(startedAt, timeLimitSec), now);
}

/** Correct answers are only shown once they can no longer help on a later attempt: after the
 * student has passed the quiz, or when they have no attempts left. With unlimited attempts that
 * means only after a pass. */
export function canRevealAnswers({
  hasPassed,
  maxAttempts,
  submittedAttempts,
}: {
  hasPassed: boolean;
  maxAttempts: number | null;
  submittedAttempts: number;
}) {
  return hasPassed || (maxAttempts != null && submittedAttempts >= maxAttempts);
}

export type AttemptBlock = { reason: "no-attempts-left" } | { reason: "cooldown"; availableAt: Date };

/**
 * Why a student can't start another attempt right now, or null if they can: every attempt used,
 * or still inside the cooldown after their last submission.
 */
export function attemptBlock(
  {
    maxAttempts,
    submittedAttempts,
    lastSubmittedAt,
    cooldownMin,
  }: { maxAttempts: number | null; submittedAttempts: number; lastSubmittedAt: Date | null; cooldownMin: number | null },
  now = new Date()
): AttemptBlock | null {
  if (maxAttempts != null && submittedAttempts >= maxAttempts) return { reason: "no-attempts-left" };
  if (cooldownMin && lastSubmittedAt) {
    const availableAt = new Date(lastSubmittedAt.getTime() + cooldownMin * 60_000);
    if (availableAt > now) return { reason: "cooldown", availableAt };
  }
  return null;
}
