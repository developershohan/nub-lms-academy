import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function revalidateEnrollmentPaths(courseId: string, slug?: string) {
  revalidatePath("/student/dashboard");
  revalidatePath("/student/my-courses");
  revalidatePath(`/student/course/${courseId}/learn`);
  if (slug) revalidatePath(`/courses/${slug}`);
}

/** Only free (price 0) courses can be self-enrolled - paid checkout arrives in Phase 6. */
export async function enrollInFreeCourse(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.status !== "PUBLISHED") return { error: "Course not available" } as const;
  if (Number(course.price) > 0) return { error: "This course requires payment, which isn't available yet" } as const;

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
