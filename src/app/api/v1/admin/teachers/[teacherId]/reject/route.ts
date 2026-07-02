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

  await prisma.teacherProfile.update({
    where: { id: teacherId },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });

  await logAudit(session.user.id, "teacher:reject", "TeacherProfile", teacherId);

  return NextResponse.json({ ok: true });
}
