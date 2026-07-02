import "server-only";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function applyForTeacher(userId: string) {
  const existing = await prisma.teacherProfile.findUnique({ where: { userId } });
  if (existing) return { error: "Application already submitted" } as const;

  const profile = await prisma.teacherProfile.create({ data: { userId } });
  return { ok: true, status: profile.status } as const;
}

export async function approveTeacherApplication(actorId: string, teacherId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const profile = await prisma.teacherProfile.findUnique({ where: { id: teacherId } });
  if (!profile) return { error: "Not found" } as const;

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

  await logAudit(actorId, "teacher:approve", "TeacherProfile", teacherId);
  return { ok: true } as const;
}

export async function rejectTeacherApplication(actorId: string, teacherId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const profile = await prisma.teacherProfile.findUnique({ where: { id: teacherId } });
  if (!profile) return { error: "Not found" } as const;

  await prisma.teacherProfile.update({
    where: { id: teacherId },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });

  await logAudit(actorId, "teacher:reject", "TeacherProfile", teacherId);
  return { ok: true } as const;
}
