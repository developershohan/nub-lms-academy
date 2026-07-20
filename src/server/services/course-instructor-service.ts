import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageCourse } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { createNotifications } from "@/server/services/notification-service";

function revalidateCoursePaths(courseId: string) {
  revalidatePath(`/teacher/courses/${courseId}/edit`);
}

export function listSubInstructors(courseId: string) {
  return prisma.courseInstructor.findMany({
    where: { courseId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Courses where the given user helps as a sub-instructor (not the owner) - used to include
 * those courses in their "pick a course" chat view alongside the ones they own. */
export function listCoursesAsSubInstructor(userId: string) {
  return prisma.courseInstructor.findMany({
    where: { userId },
    include: { course: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Sub-instructors of every course the student is actively enrolled in - their "message a
 * sub-instructor" contact list. */
export async function listSubInstructorsForStudent(userId: string) {
  const rows = await prisma.courseInstructor.findMany({
    where: { course: { enrollments: { some: { userId, status: "ACTIVE" } } } },
    include: { user: { select: { id: true, name: true, email: true } }, course: { select: { title: true } } },
    distinct: ["userId"],
  });
  return rows;
}

/** Only the owning teacher (canManageCourse) can assign sub-instructors on their own course - a
 * sub-instructor cannot themselves add further sub-instructors. The target must already be a
 * TEACHER (a student can't be made a sub-instructor) and an existing account (see docs - manual
 * assignment intentionally does not auto-create accounts). */
export async function addSubInstructorByEmail(actorId: string, courseId: string, email: string) {
  if (!(await canManageCourse(actorId, courseId))) return { error: "Forbidden" } as const;

  const target = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { roles: { include: { role: true } } },
  });
  if (!target || target.status !== "ACTIVE") return { error: "No active account found with that email" } as const;

  const roles = target.roles.map((r) => r.role.name);
  if (!roles.includes("TEACHER")) return { error: "That account isn't a teacher" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true, title: true } });
  if (course?.teacherId === target.id) return { error: "That's already the course owner" } as const;

  const existing = await prisma.courseInstructor.findUnique({
    where: { courseId_userId: { courseId, userId: target.id } },
  });
  if (existing) return { error: "Already a sub-instructor on this course" } as const;

  await prisma.courseInstructor.create({ data: { courseId, userId: target.id, addedById: actorId } });
  await logAudit(actorId, "course:add-sub-instructor", "Course", courseId, { userId: target.id });
  await createNotifications([
    {
      userId: target.id,
      type: "course_instructor",
      title: `You were added as a sub-instructor on ${course?.title ?? "a course"}`,
      link: "/teacher/messages",
    },
  ]);
  revalidateCoursePaths(courseId);
  return { ok: true } as const;
}

export async function removeSubInstructor(actorId: string, courseId: string, userId: string) {
  if (!(await canManageCourse(actorId, courseId))) return { error: "Forbidden" } as const;

  await prisma.courseInstructor.deleteMany({ where: { courseId, userId } });
  await logAudit(actorId, "course:remove-sub-instructor", "Course", courseId, { userId });
  revalidateCoursePaths(courseId);
  return { ok: true } as const;
}
