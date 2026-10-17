import "server-only";
import { prisma } from "@/lib/prisma";
import { progressPercent } from "@/server/services/progress-service";
import type { Prisma } from "@/generated/prisma/client";

/*
 * The home page. Shared lists (trending, top instructors) take no user and return plain data, so
 * home-cache.ts can cache them for everyone; per-student lists (continue learning, because you
 * viewed) are read fresh and filter the shared ones in memory.
 */

/** What CourseCard shows - no dates, so results survive the JSON round trip of the data cache. */
export const COURSE_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  thumbnailUrl: true,
  price: true,
  salePrice: true,
  level: true,
  ratingAvg: true,
  ratingCount: true,
  totalDurationSec: true,
  lessonCount: true,
  categoryId: true,
  category: { select: { name: true, slug: true } },
  teacher: { select: { name: true } },
} satisfies Prisma.CourseSelect;

export type HomeCourse = Prisma.CourseGetPayload<{ select: typeof COURSE_CARD_SELECT }>;

/**
 * The student's unfinished courses, most recently studied first, with how far along they are and
 * the lesson they last opened (the player resumes there). Courses never opened come last, newest
 * enrollment first.
 */
export async function listContinueLearning(userId: string, take = 3) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE", completedAt: null, course: { lessonCount: { gt: 0 } } },
    orderBy: { enrolledAt: "desc" },
    select: { enrolledAt: true, course: { select: COURSE_CARD_SELECT } },
  });
  if (enrollments.length === 0) return [];

  const progress = await prisma.lessonProgress.findMany({
    where: { userId, lesson: { section: { courseId: { in: enrollments.map((e) => e.course.id) } } } },
    select: {
      completed: true,
      lastViewedAt: true,
      updatedAt: true,
      lesson: { select: { id: true, title: true, section: { select: { courseId: true } } } },
    },
  });

  const byCourse = new Map<string, { completed: number; last: (typeof progress)[number] | null }>();
  for (const row of progress) {
    const courseId = row.lesson.section.courseId;
    const entry = byCourse.get(courseId) ?? { completed: 0, last: null };
    if (row.completed) entry.completed += 1;
    const seen = row.lastViewedAt ?? row.updatedAt;
    if (!entry.last || seen > (entry.last.lastViewedAt ?? entry.last.updatedAt)) entry.last = row;
    byCourse.set(courseId, entry);
  }

  return enrollments
    .map(({ course, enrolledAt }) => {
      const entry = byCourse.get(course.id);
      const last = entry?.last ?? null;
      return {
        course,
        percent: progressPercent(entry?.completed ?? 0, course.lessonCount),
        lastLesson: last ? { id: last.lesson.id, title: last.lesson.title } : null,
        lastStudiedAt: last ? (last.lastViewedAt ?? last.updatedAt) : null,
        enrolledAt,
      };
    })
    .sort(
      (a, b) =>
        (b.lastStudiedAt?.getTime() ?? 0) - (a.lastStudiedAt?.getTime() ?? 0) || b.enrolledAt.getTime() - a.enrolledAt.getTime()
    )
    .slice(0, take);
}

export async function recordCourseView(userId: string, courseId: string, now = new Date()) {
  await prisma.courseView.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: { userId, courseId, viewedAt: now },
    update: { viewedAt: now },
  });
}

/** Ids of courses the student already has, which recommendations should never show them. */
export async function listOwnedCourseIds(userId: string) {
  const rows = await prisma.enrollment.findMany({ where: { userId, status: "ACTIVE" }, select: { courseId: true } });
  return new Set(rows.map((r) => r.courseId));
}

/**
 * "Because you viewed X": the last published course the student looked at without enrolling, and
 * the best-rated courses in the same category that they don't have yet.
 */
export async function getBecauseYouViewed(userId: string, owned: Set<string>, take = 4) {
  const views = await prisma.courseView.findMany({
    where: { userId, course: { status: "PUBLISHED", categoryId: { not: null } } },
    orderBy: { viewedAt: "desc" },
    take: 10,
    select: { course: { select: { id: true, title: true, slug: true, categoryId: true } } },
  });
  const basedOn = views.map((v) => v.course).find((c) => !owned.has(c.id));
  if (!basedOn) return null;

  const courses = await prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      categoryId: basedOn.categoryId,
      id: { notIn: [basedOn.id, ...owned] },
    },
    orderBy: [{ ratingAvg: "desc" }, { ratingCount: "desc" }, { publishedAt: "desc" }],
    take,
    select: COURSE_CARD_SELECT,
  });
  return courses.length > 0 ? { basedOn, courses } : null;
}

/**
 * Most enrolled-in published courses over the last `days` days, optionally in one category. Quiet
 * stretches are topped up with the best-rated courses, so the rail is never empty on a new site.
 */
export async function listTrendingCourses({
  categoryId = null,
  days = 30,
  take = 12,
  now = new Date(),
}: { categoryId?: string | null; days?: number; take?: number; now?: Date } = {}) {
  const courseWhere: Prisma.CourseWhereInput = { status: "PUBLISHED", ...(categoryId ? { categoryId } : {}) };
  const since = new Date(now.getTime() - days * 86_400_000);
  const counts = await prisma.enrollment.groupBy({
    by: ["courseId"],
    where: { status: "ACTIVE", enrolledAt: { gte: since }, course: courseWhere },
    _count: { _all: true },
    orderBy: { _count: { courseId: "desc" } },
    take,
  });
  const rank = new Map(counts.map((c, i) => [c.courseId, i]));
  const hot = await prisma.course.findMany({ where: { id: { in: [...rank.keys()] } }, select: COURSE_CARD_SELECT });
  hot.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);

  const fill =
    hot.length < take
      ? await prisma.course.findMany({
          where: { ...courseWhere, id: { notIn: hot.map((c) => c.id) } },
          orderBy: [{ ratingCount: "desc" }, { ratingAvg: "desc" }, { publishedAt: "desc" }],
          take: take - hot.length,
          select: COURSE_CARD_SELECT,
        })
      : [];
  return [...hot, ...fill];
}

/** The category a student seems most into: where most of their courses and recent views are. */
export async function getFavouriteCategory(userId: string) {
  const [enrolled, viewed] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId, status: "ACTIVE", course: { categoryId: { not: null } } },
      select: { course: { select: { categoryId: true } } },
    }),
    prisma.courseView.findMany({
      where: { userId, course: { categoryId: { not: null } } },
      orderBy: { viewedAt: "desc" },
      take: 10,
      select: { course: { select: { categoryId: true } } },
    }),
  ]);
  const tally = new Map<string, number>();
  // An enrollment says more than a glance at a course page.
  for (const e of enrolled) tally.set(e.course.categoryId!, (tally.get(e.course.categoryId!) ?? 0) + 2);
  for (const v of viewed) tally.set(v.course.categoryId!, (tally.get(v.course.categoryId!) ?? 0) + 1);
  const [top] = [...tally].sort((a, b) => b[1] - a[1]);
  if (!top) return null;
  return prisma.category.findUnique({ where: { id: top[0] }, select: { id: true, name: true, slug: true } });
}

/**
 * Instructors with published courses, ranked by active students across those courses, with their
 * review-weighted rating. Plain data (no dates), so it can be cached for everyone.
 */
export async function listTopInstructors(take = 4) {
  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      teacherId: true,
      ratingAvg: true,
      ratingCount: true,
      teacher: { select: { name: true, image: true, teacherProfile: { select: { headline: true } } } },
    },
  });
  const students = await prisma.enrollment.groupBy({
    by: ["courseId"],
    where: { status: "ACTIVE", courseId: { in: courses.map((c) => c.id) } },
    _count: { _all: true },
  });
  const studentsByCourse = new Map(students.map((s) => [s.courseId, s._count._all]));

  const teachers = new Map<
    string,
    { id: string; name: string | null; image: string | null; headline: string | null; courses: number; students: number; ratingTotal: number; ratingCount: number }
  >();
  for (const course of courses) {
    const t = teachers.get(course.teacherId) ?? {
      id: course.teacherId,
      name: course.teacher.name,
      image: course.teacher.image,
      headline: course.teacher.teacherProfile?.headline ?? null,
      courses: 0,
      students: 0,
      ratingTotal: 0,
      ratingCount: 0,
    };
    t.courses += 1;
    t.students += studentsByCourse.get(course.id) ?? 0;
    t.ratingTotal += course.ratingAvg * course.ratingCount;
    t.ratingCount += course.ratingCount;
    teachers.set(course.teacherId, t);
  }
  return [...teachers.values()]
    .map(({ ratingTotal, ...t }) => ({ ...t, ratingAvg: t.ratingCount ? Math.round((ratingTotal / t.ratingCount) * 10) / 10 : 0 }))
    .sort((a, b) => b.students - a.students || b.ratingAvg - a.ratingAvg)
    .slice(0, take);
}

export type TopInstructor = Awaited<ReturnType<typeof listTopInstructors>>[number];
