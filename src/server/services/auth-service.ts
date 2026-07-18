import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import type { RegisterInput, ResetPasswordInput } from "@/lib/validations/auth";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const VERIFY_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30; // 30min

// Reuses the VerificationToken table (already used for password reset) with a prefixed
// identifier, rather than a separate table or a schema change - the {identifier, token} unique
// key already keeps the two kinds of token from ever colliding for the same email.
const verifyIdentifier = (email: string) => `email-verify:${email}`;

export async function registerUser({ name, email, password }: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email } });
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
    data: { identifier, token, expires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS) },
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
export async function resendVerificationEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return;
  await sendEmailVerification(email);
}

export async function verifyEmail(email: string, token: string) {
  const identifier = verifyIdentifier(email);
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

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) return; // Don't reveal whether the email exists.

  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const resetUrl = `${APP_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  const result = await sendPasswordResetEmail(email, resetUrl);
  // Dev-only fallback so the flow is testable without a configured email provider - never logs
  // the live token in production (see docs/security.md).
  if (!result.ok && process.env.NODE_ENV !== "production") {
    console.log(`Password reset link for ${email}: ${resetUrl}`);
  }
}

export async function resetPassword(email: string, { token, password }: ResetPasswordInput) {
  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });
  if (!record || record.expires < new Date()) {
    return { error: "Invalid or expired reset link" } as const;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { email }, data: { passwordHash } }),
    prisma.verificationToken.delete({ where: { identifier_token: { identifier: email, token } } }),
  ]);
  return { ok: true } as const;
}
