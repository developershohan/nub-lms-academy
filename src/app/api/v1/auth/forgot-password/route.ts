import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { email } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Always return ok, whether or not the email exists.
  if (user?.passwordHash) {
    const token = randomBytes(32).toString("hex");
    await prisma.verificationToken.create({
      data: { identifier: email, token, expires: new Date(Date.now() + 1000 * 60 * 30) },
    });
    // No email provider configured yet (see .env.example) - log the link instead.
    console.log(`Password reset link for ${email}: /reset-password?token=${token}&email=${encodeURIComponent(email)}`);
  }

  return NextResponse.json({ ok: true });
}
