import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCourseChecklist } from "@/lib/studio";
import { CHECKLIST_SELECT, checklistFor, getCourseForEdit } from "@/server/services/course-service";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The course a studio page edits, with its publish checklist - null unless the user owns it.
 * Cached for the request, since the studio layout and the page both ask for it.
 */
export const getStudioCourse = cache(async (courseId: string, userId: string) => {
  const course = await getCourseForEdit(courseId, userId);
  if (!course) return null;
  const checklist = getCourseChecklist({
    ...course,
    outcomeCount: course.outcomes.length,
    requirementCount: course.requirements.length,
  });
  return { course, checklist };
});

/**
 * What students actually paid per course: each order item's list price scaled by its order's
 * coupon discount (total / subtotal). Paid orders only - refunded and disputed ones don't count.
 */
async function salesByCourse(where: Prisma.OrderItemWhereInput) {
  const items = await prisma.orderItem.findMany({
    where: { ...where, order: { status: "PAID" } },
    select: { courseId: true, price: true, order: { select: { subtotal: true, total: true } } },
  });
  const sales = new Map<string, { amount: number; count: number }>();
  for (const item of items) {
    const subtotal = Number(item.order.subtotal);
    const paidShare = subtotal > 0 ? Number(item.order.total) / subtotal : 0;
    const entry = sales.get(item.courseId) ?? { amount: 0, count: 0 };
    entry.amount += Number(item.price) * paidShare;
    entry.count += 1;
    sales.set(item.courseId, entry);
  }
  return sales;
}

function countsByCourse(rows: { courseId: string; _count: { _all: number } }[]) {
  return new Map(rows.map((row) => [row.courseId, row._count._all]));
}

/** Every course a teacher owns, newest edit first, with students, completions, sales and checklist progress. */
export async function listInstructorCourses(teacherId: string) {
  const [courses, enrolled, completed, sales] = await Promise.all([
    prisma.course.findMany({
      where: { teacherId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        rejectionReason: true,
        changedSinceReviewAt: true,
        updatedAt: true,
        level: true,
        price: true,
        salePrice: true,
        ratingAvg: true,
        ratingCount: true,
        lessonCount: true,
        totalDurationSec: true,
        category: { select: { name: true, slug: true } },
        ...CHECKLIST_SELECT,
      },
    }),
    prisma.enrollment.groupBy({
      by: ["courseId"],
      where: { status: "ACTIVE", course: { teacherId } },
      _count: { _all: true },
    }),
    prisma.enrollment.groupBy({
      by: ["courseId"],
      where: { status: "ACTIVE", completedAt: { not: null }, course: { teacherId } },
      _count: { _all: true },
    }),
    salesByCourse({ course: { teacherId } }),
  ]);
  const students = countsByCourse(enrolled);
  const completions = countsByCourse(completed);

  return courses.map((course) => ({
    ...course,
    students: students.get(course.id) ?? 0,
    completions: completions.get(course.id) ?? 0,
    sales: sales.get(course.id)?.amount ?? 0,
    checklist: checklistFor(course),
  }));
}

export type InstructorCourse = Awaited<ReturnType<typeof listInstructorCourses>>[number];

/** Newest visible reviews across a teacher's courses (or one course), for the dashboard and studio overview. */
export function listRecentReviews(where: { teacherId: string } | { courseId: string }, take = 4) {
  return prisma.courseReview.findMany({
    where: { hidden: false, ...("courseId" in where ? { courseId: where.courseId } : { course: { teacherId: where.teacherId } }) },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      user: { select: { name: true } },
      course: { select: { id: true, title: true } },
    },
  });
}

/** One course's numbers for the studio overview. The caller must have checked the teacher owns it. */
export async function getCoursePerformance(courseId: string) {
  const [students, completions, sales, reviews] = await Promise.all([
    prisma.enrollment.count({ where: { courseId, status: "ACTIVE" } }),
    prisma.enrollment.count({ where: { courseId, status: "ACTIVE", completedAt: { not: null } } }),
    salesByCourse({ courseId }),
    listRecentReviews({ courseId }, 3),
  ]);
  return { students, completions, sales: sales.get(courseId)?.amount ?? 0, reviews };
}
