import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Recomputes the denormalised catalogue numbers on Course (rating, length, lesson count and the
 * price checkout charges) from the source rows. Called after anything that changes them - review
 * submit/hide, lesson create/edit/delete, section delete, price edits - so the catalogue can sort
 * and filter on plain columns instead of aggregating every course on every request.
 */
export async function refreshCourseStats(courseId: string) {
  const [course, rating, lessons] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { price: true, salePrice: true } }),
    prisma.courseReview.aggregate({
      where: { courseId, hidden: false },
      _avg: { rating: true },
      _count: true,
    }),
    prisma.lesson.aggregate({
      where: { section: { courseId } },
      _sum: { durationSec: true },
      _count: true,
    }),
  ]);
  if (!course) return;

  await prisma.course.update({
    where: { id: courseId },
    data: {
      ratingAvg: Math.round((rating._avg.rating ?? 0) * 100) / 100,
      ratingCount: rating._count,
      totalDurationSec: lessons._sum.durationSec ?? 0,
      lessonCount: lessons._count,
      effectivePrice: course.salePrice ?? course.price,
    },
  });
}
