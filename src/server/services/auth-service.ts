import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { findUserByEmail } from "@/lib/user-by-email";
import { disconnectUserSockets } from "@/lib/realtime";
import { limitAuthAttempt, tooManyAttemptsMessage } from "@/lib/rate-limit";
import { normalizeEmail, type RegisterInput, type ResetPasswordInput } from "@/lib/validations/auth";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30; // 30min

// Reuses the VerificationToken table (already used for password reset) with a prefixed
// identifier, rather than a separate table or a schema change - the {identifier, token} unique
// key already keeps the two kinds of token from ever colliding for the same email.
const verifyIdentifier = (email: string) => `email-verify:${email}`;

/** Only a SHA-256 of each emailed token is stored, so a leaked database (or backup) can't be used
 * to reset passwords or verify emails - the raw token exists only in the link that was emailed. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Request context the caller (server action or API route) knows and a service doesn't. */
type RequestMeta = { ip?: string | null };

export async function registerUser({ name, email: rawEmail, password }: RegisterInput, { ip }: RequestMeta = {}) {
  const limit = await limitAuthAttempt("register", { ip });
  if (limit.limited) return { error: tooManyAttemptsMessage(limit.retryAfterSec), rateLimited: true } as const;

  // registerSchema already lowercases, but this is the one place accounts are created from user
  // input, so normalise here too - and check case-insensitively against older mixed-case rows.
  const email = normalizeEmail(rawEmail);
  const existing = await findUserByEmail(email);
  // Unlike login/password-reset, registration intentionally tells the user the
  // email is taken - the confusing alternative is a fake "created" message.
  if (existing) return { error: "An account with this email already exists" } as const;

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    const studentRole = await tx.role.upsert({
      where: { name: "STUDENT" },
      create: { name: "STUDENT" },
      update: {},
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: studentRole.id } });
  });
  await sendEmailVerification(email);
  return { ok: true } as const;
}

/** Sends (or resends) a verification link. Safe to call even if the email doesn't exist or is
 * already verified - callers that need to hide account existence should check first. */
export async function sendEmailVerification(email: string) {
  const identifier = verifyIdentifier(email);
  // Drop any outstanding tokens first so a user who requests several links can only use the
  // latest one - old links stop working instead of piling up as still-valid alternates.
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: { identifier, token: hashToken(token), expires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS) },
  });

  const verifyUrl = `${APP_URL}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
  const result = await sendVerificationEmail(email, verifyUrl);
  if (!result.ok && process.env.NODE_ENV !== "production") {
    console.log(`Verification link for ${email}: ${verifyUrl}`);
  }
}

/** Generic no-op for a nonexistent or already-verified email, same anti-enumeration reasoning as
 * password reset - the caller (a "resend verification" button) shouldn't be able to probe which
 * emails have accounts. */
export async function resendVerificationEmail(email: string, { ip }: RequestMeta = {}) {
  // Silently skipped when limited, like the not-found case: the caller shows the same message.
  const limit = await limitAuthAttempt("verificationEmail", { email: normalizeEmail(email), ip });
  if (limit.limited) return;
  const user = await findUserByEmail(email);
  if (!user || user.emailVerified) return;
  await sendEmailVerification(user.email);
}

export async function verifyEmail(email: string, rawToken: string) {
  const identifier = verifyIdentifier(email);
  const token = hashToken(rawToken);
  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token } },
  });
  if (!record || record.expires < new Date()) {
    return { error: "Invalid or expired verification link" } as const;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { email }, data: { emailVerified: new Date() } }),
    prisma.verificationToken.delete({ where: { identifier_token: { identifier, token } } }),
  ]);
  return { ok: true } as const;
}

export async function requestPasswordReset(typedEmail: string, { ip }: RequestMeta = {}) {
  // Limited per typed address and per IP whether or not the account exists, so the limit itself
  // reveals nothing about which emails have accounts.
  const limit = await limitAuthAttempt("passwordReset", { email: normalizeEmail(typedEmail), ip });
  if (limit.limited) return { error: tooManyAttemptsMessage(limit.retryAfterSec), rateLimited: true } as const;

  const user = await findUserByEmail(typedEmail);
  if (!user?.passwordHash) return { ok: true } as const; // Don't reveal whether the email exists.
  // The stored address (not whatever casing was typed) goes into the token and the link, so
  // resetPassword's exact lookup below matches the account.
  const email = user.email;

  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: { identifier: email, token: hashToken(token), expires: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const resetUrl = `${APP_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  const result = await sendPasswordResetEmail(email, resetUrl);
  // Dev-only fallback so the flow is testable without a configured email provider - never logs
  // the live token in production (see docs/security.md).
  if (!result.ok && process.env.NODE_ENV !== "production") {
    console.log(`Password reset link for ${email}: ${resetUrl}`);
  }
  return { ok: true } as const;
}

export async function resetPassword(
  email: string,
  { token: rawToken, password }: ResetPasswordInput,
  { ip }: RequestMeta = {}
) {
  const limit = await limitAuthAttempt("passwordReset", { ip });
  if (limit.limited) return { error: tooManyAttemptsMessage(limit.retryAfterSec), rateLimited: true } as const;

  const token = hashToken(rawToken);
  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });
  if (!record || record.expires < new Date()) {
    return { error: "Invalid or expired reset link" } as const;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await prisma.$transaction([
    // A reset usually means the old password is compromised: end every existing session.
    prisma.user.update({ where: { email }, data: { passwordHash, sessionVersion: { increment: 1 } } }),
    // Every outstanding reset link for this address dies with the one just used.
    prisma.verificationToken.deleteMany({ where: { identifier: email } }),
  ]);
  disconnectUserSockets(user.id);
  return { ok: true } as const;
}
