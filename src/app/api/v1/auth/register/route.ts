import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Don't reveal whether the email is already registered.
    return NextResponse.json({ ok: true });
  }

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

  return NextResponse.json({ ok: true });
}
