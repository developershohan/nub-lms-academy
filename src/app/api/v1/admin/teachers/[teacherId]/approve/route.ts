import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function POST(_request: Request, { params }: { params: Promise<{ teacherId: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !(await canAdminAccess(session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teacherId } = await params;
  const profile = await prisma.teacherProfile.findUnique({ where: { id: teacherId } });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.teacherProfile.update({
      where: { id: teacherId },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });
    const teacherRole = await tx.role.upsert({
      where: { name: "TEACHER" },
      create: { name: "TEACHER" },
      update: {},
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: profile.userId, roleId: teacherRole.id } },
      create: { userId: profile.userId, roleId: teacherRole.id },
      update: {},
    });
  });

  await logAudit(session.user.id, "teacher:approve", "TeacherProfile", teacherId);

  return NextResponse.json({ ok: true });
}
