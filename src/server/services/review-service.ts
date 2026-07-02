import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export function listCourseReviews(courseId: string) {
  return prisma.courseReview.findMany({
    where: { courseId, hidden: false },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCourseRatingSummary(courseId: string) {
  const agg = await prisma.courseReview.aggregate({
    where: { courseId, hidden: false },
    _avg: { rating: true },
    _count: true,
  });
  return { average: agg._avg.rating ?? 0, count: agg._count };
}

export async function submitReview(
  userId: string,
  courseId: string,
  slug: string,
  rating: number,
  comment: string | undefined
) {
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (!enrollment || enrollment.status !== "ACTIVE") {
    return { error: "Only enrolled students can review this course" } as const;
  }

  await prisma.courseReview.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: { userId, courseId, rating, comment },
    update: { rating, comment },
  });
  revalidatePath(`/courses/${slug}`);
  return { ok: true } as const;
}

export function listAllReviewsForAdmin() {
  return prisma.courseReview.findMany({
    include: { user: { select: { name: true, email: true } }, course: { select: { title: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function setReviewHidden(actorId: string, reviewId: string, hidden: boolean) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const review = await prisma.courseReview.update({
    where: { id: reviewId },
    data: { hidden },
    include: { course: { select: { slug: true } } },
  });
  await logAudit(actorId, hidden ? "review:hide" : "review:unhide", "CourseReview", reviewId);
  revalidatePath(`/courses/${review.course.slug}`);
  revalidatePath("/admin/reviews");
  return { ok: true } as const;
}

export async function deleteReview(actorId: string, reviewId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  const review = await prisma.courseReview.delete({
    where: { id: reviewId },
    include: { course: { select: { slug: true } } },
  });
  await logAudit(actorId, "review:delete", "CourseReview", reviewId);
  revalidatePath(`/courses/${review.course.slug}`);
  revalidatePath("/admin/reviews");
  return { ok: true } as const;
}
