import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

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

/** For the "start a conversation" picker - students actively enrolled in one of this teacher's courses. */
export function listStudentsForTeacher(teacherId: string) {
  return prisma.user.findMany({
    where: { enrollments: { some: { status: "ACTIVE", course: { teacherId } } } },
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
