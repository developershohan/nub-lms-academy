/** Slack between the student's countdown reaching zero (which auto-submits the form) and the
 * server receiving that submission over a slow connection. */
export const QUIZ_SUBMIT_GRACE_MS = 30_000;

/** When an attempt's time runs out, or null for no limit. A 0 limit also means "no limit": that's
 * what a blank time-limit field used to be saved as, so it must never mean "already expired". */
export function quizDeadline(startedAt: Date, timeLimitSec: number | null | undefined): Date | null {
  if (!timeLimitSec || timeLimitSec <= 0) return null;
  return new Date(startedAt.getTime() + timeLimitSec * 1000);
}

export function isAttemptExpired(startedAt: Date, timeLimitSec: number | null | undefined, now = new Date()) {
  const deadline = quizDeadline(startedAt, timeLimitSec);
  return deadline !== null && now.getTime() > deadline.getTime() + QUIZ_SUBMIT_GRACE_MS;
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
