import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { createNotifications } from "@/server/services/notification-service";

async function getAdminUserIds() {
  const admins = await prisma.userRole.findMany({
    where: { role: { name: { in: ["ADMIN", "SUPER_ADMIN"] } } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return admins.map((a) => a.userId);
}

export async function applyForTeacher(userId: string) {
  const existing = await prisma.teacherProfile.findUnique({ where: { userId } });
  if (existing) return { error: "Application already submitted" } as const;

  const [profile, applicant] = await Promise.all([
    prisma.teacherProfile.create({ data: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
  ]);

  const adminIds = await getAdminUserIds();
  if (adminIds.length) {
    await createNotifications(
      adminIds.map((id) => ({
        userId: id,
        type: "teacher_application",
        title: "New teacher application",
        body: applicant?.name ?? applicant?.email ?? "A user applied to become a teacher",
        link: "/admin/teachers",
      }))
    );
  }

  revalidatePath("/teacher/apply");
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/dashboard");
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
  await createNotifications([
    {
      userId: profile.userId,
      type: "teacher_application",
      title: "You're approved as a teacher",
      body: "You can now create and publish courses.",
      link: "/teacher/dashboard",
    },
  ]);
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/dashboard");
  revalidatePath("/teacher/apply");
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
  await createNotifications([
    {
      userId: profile.userId,
      type: "teacher_application",
      title: "Your teacher application was rejected",
      link: "/teacher/apply",
    },
  ]);
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/dashboard");
  revalidatePath("/teacher/apply");
  return { ok: true } as const;
}
