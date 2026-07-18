import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canManageCourse, canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { createNotifications } from "@/server/services/notification-service";

function revalidateEnrollmentPaths(courseId: string, slug?: string) {
  revalidatePath("/student/dashboard");
  revalidatePath("/student/my-courses");
  revalidatePath(`/student/course/${courseId}/learn`);
  if (slug) revalidatePath(`/courses/${slug}`);
}

/** Only free courses (sale price or regular price of 0) can be self-enrolled - anything above $0
 * goes through checkout (order-service.ts), which is the same "effective price" rule the course
 * detail page uses to decide which button (Enroll vs Buy) to show in the first place. */
export async function enrollInFreeCourse(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.status !== "PUBLISHED") return { error: "Course not available" } as const;

  const effectivePrice = Number(course.salePrice ?? course.price);
  if (effectivePrice > 0) return { error: "This course requires payment - use the buy button instead" } as const;

  const existing = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) return { error: "Already enrolled" } as const;

  await prisma.enrollment.create({ data: { userId, courseId, source: "FREE" } });
  revalidateEnrollmentPaths(courseId, course.slug);
  return { ok: true } as const;
}

export function getEnrollment(userId: string, courseId: string) {
  return prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
}

export function listStudentEnrollments(userId: string) {
  return prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      course: {
        include: {
          category: true,
          sections: { include: { lessons: { select: { id: true } } } },
        },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });
}

/** Scoped to one course - the per-course chat contact list for a teacher/sub-instructor. */
export function listStudentsForCourse(courseId: string) {
  return prisma.user.findMany({
    where: { enrollments: { some: { status: "ACTIVE", courseId } } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/** For the "start a conversation" picker - teachers of courses this student is actively enrolled in. */
export function listTeachersForStudent(userId: string) {
  return prisma.user.findMany({
    where: { courses: { some: { enrollments: { some: { userId, status: "ACTIVE" } } } } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/** Other students sharing at least one active enrollment with the given user - the "classmates"
 * contact list for student-to-student chat. */
export async function listClassmates(userId: string) {
  const courseIds = await prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE" },
    select: { courseId: true },
  });
  if (courseIds.length === 0) return [];

  return prisma.user.findMany({
    where: {
      id: { not: userId },
      enrollments: { some: { status: "ACTIVE", courseId: { in: courseIds.map((c) => c.courseId) } } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    distinct: ["id"],
  });
}

/** Manual enrollment by email - the owning teacher (their own course) or an admin (any course).
 * Requires an existing, active account; does not auto-create one (see docs/security.md's manual-
 * assignment decision). Uses the ADMIN_GRANT source since it bypasses the normal free/purchase
 * eligibility checks entirely - this is a deliberate override, not a self-service enrollment. */
export async function enrollUserByEmail(actorId: string, courseId: string, email: string) {
  const allowed = (await canManageCourse(actorId, courseId)) || (await canAdminAccess(actorId));
  if (!allowed) return { error: "Forbidden" } as const;

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { title: true, slug: true } });
  if (!course) return { error: "Course not found" } as const;

  const target = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!target || target.status !== "ACTIVE") return { error: "No active account found with that email" } as const;

  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: target.id, courseId } },
  });
  if (existing?.status === "ACTIVE") return { error: "Already enrolled" } as const;

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: target.id, courseId } },
    create: { userId: target.id, courseId, source: "ADMIN_GRANT" },
    update: { status: "ACTIVE", source: "ADMIN_GRANT" },
  });
  await logAudit(actorId, "enrollment:manual-grant", "Course", courseId, { userId: target.id });
  await createNotifications([
    { userId: target.id, type: "enrollment", title: `You were enrolled in ${course.title}`, link: "/student/my-courses" },
  ]);
  revalidateEnrollmentPaths(courseId, course.slug);
  return { ok: true } as const;
}
