import { prisma } from "@/lib/prisma";

export type RateLimitRule = { limit: number; windowSec: number };
export type RateLimitResult = { limited: boolean; retryAfterSec: number };

const MINUTE = 60;

/** Per-account limits stop guessing one user's password; per-IP limits stop one machine spraying
 * many accounts (and burning CPU on bcrypt). Sign-in attempts count whether or not they succeed. */
export const AUTH_RATE_LIMITS = {
  login: { account: { limit: 10, windowSec: 15 * MINUTE }, ip: { limit: 50, windowSec: 15 * MINUTE } },
  register: { ip: { limit: 10, windowSec: 60 * MINUTE } },
  passwordReset: { account: { limit: 5, windowSec: 60 * MINUTE }, ip: { limit: 20, windowSec: 60 * MINUTE } },
  verificationEmail: { account: { limit: 5, windowSec: 60 * MINUTE } },
} satisfies Record<string, { account?: RateLimitRule; ip?: RateLimitRule }>;

export type AuthRateLimitKind = keyof typeof AUTH_RATE_LIMITS;

/**
 * Fixed-window counter in Postgres (the RateLimit table) - the web app may run serverless, so an
 * in-memory counter wouldn't be shared between instances, and Redis only arrives in the real-time
 * phase. Swap this one function for a Redis INCR/EXPIRE then; callers don't change.
 *
 * Not perfectly atomic at a window boundary (two first hits can both start a window), which only
 * ever lets a request or two extra through. Fails open: a database error must not lock everyone out.
 */
export async function consumeRateLimit(
  key: string,
  { limit, windowSec }: RateLimitRule,
  now = new Date()
): Promise<RateLimitResult> {
  try {
    const { count } = await prisma.rateLimit.updateMany({
      where: { key, resetAt: { gt: now } },
      data: { count: { increment: 1 } },
    });
    if (count === 0) {
      const resetAt = new Date(now.getTime() + windowSec * 1000);
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return { limited: false, retryAfterSec: 0 };
    }

    const row = await prisma.rateLimit.findUnique({ where: { key } });
    if (!row || row.count <= limit) return { limited: false, retryAfterSec: 0 };
    return { limited: true, retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)) };
  } catch (err) {
    console.error("Rate limit check failed:", err instanceof Error ? err.message : "unknown error");
    return { limited: false, retryAfterSec: 0 };
  }
}

/** Counts one attempt of `kind` against the account (when an email is known) and the client IP
 * (when known - with no IP there is nothing fair to key on, so that check is skipped rather than
 * lumping every unknown client into one shared bucket). */
export async function limitAuthAttempt(
  kind: AuthRateLimitKind,
  { email, ip }: { email?: string | null; ip?: string | null }
): Promise<RateLimitResult> {
  const rules: { account?: RateLimitRule; ip?: RateLimitRule } = AUTH_RATE_LIMITS[kind];
  const checks: Promise<RateLimitResult>[] = [];
  if (rules.account && email) checks.push(consumeRateLimit(`${kind}:account:${email.toLowerCase()}`, rules.account));
  if (rules.ip && ip) checks.push(consumeRateLimit(`${kind}:ip:${ip}`, rules.ip));

  const results = await Promise.all(checks);
  const limited = results.filter((r) => r.limited);
  if (limited.length === 0) return { limited: false, retryAfterSec: 0 };
  return { limited: true, retryAfterSec: Math.max(...limited.map((r) => r.retryAfterSec)) };
}

/** The caller's IP as the hosting proxy reports it (Render and Vercel both set X-Forwarded-For;
 * the first entry is the client). A spoofed header can only dodge the per-IP limit - the
 * per-account limit still holds. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}

export function tooManyAttemptsMessage(retryAfterSec: number) {
  const minutes = Math.ceil(retryAfterSec / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
