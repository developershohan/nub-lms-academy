import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } });
  if (existing) {
    return NextResponse.json({ error: "Application already submitted" }, { status: 409 });
  }

  const profile = await prisma.teacherProfile.create({ data: { userId: session.user.id } });
  return NextResponse.json({ status: profile.status });
}
