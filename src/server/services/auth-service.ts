import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { RegisterInput, ResetPasswordInput } from "@/lib/validations/auth";

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
  return { ok: true } as const;
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) return; // Don't reveal whether the email exists.

  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires: new Date(Date.now() + 1000 * 60 * 30) },
  });
  // No email provider configured yet (see .env.example) - log the link instead, but only in
  // development. Logging a live, unexpired reset token to production server logs would be a real
  // exposure regardless of who can read those logs; password reset is already non-functional for
  // real users in production without an email provider, so gating this doesn't remove any
  // capability that currently works there.
  if (process.env.NODE_ENV !== "production") {
    console.log(`Password reset link for ${email}: /reset-password?token=${token}&email=${encodeURIComponent(email)}`);
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
