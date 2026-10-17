import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { summarizeRatings } from "@/lib/ratings";

export type LessonPreview = { kind: "video"; videoId: string } | { kind: "text"; content: string };

/**
 * Everything the public course page shows, in one place. Wrapped in React's cache() so the page
 * and its generateMetadata share a single set of queries per request. Only free-preview lessons
 * carry their content or video id - every other lesson exposes title, type and length only.
 */
export const getCourseLanding = cache(async (slug: string) => {
  const course = await prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      category: true,
      teacher: {
        select: { id: true, name: true, image: true, teacherProfile: { select: { headline: true, bio: true } } },
      },
      requirements: { orderBy: { sortOrder: "asc" } },
      outcomes: { orderBy: { sortOrder: "asc" } },
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true, type: true, durationSec: true, isPreview: true },
          },
        },
      },
      _count: { select: { quizzes: { where: { questions: { some: {} } } } } },
    },
  });
  if (!course) return null;

  const [studentCount, ratingGroups, reviews, previewLessons, instructor] = await Promise.all([
    prisma.enrollment.count({ where: { courseId: course.id, status: "ACTIVE" } }),
    prisma.courseReview.groupBy({
      by: ["rating"],
      where: { courseId: course.id, hidden: false },
      _count: { _all: true },
    }),
    prisma.courseReview.findMany({
      where: { courseId: course.id, hidden: false },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.lesson.findMany({
      where: { isPreview: true, section: { courseId: course.id } },
      select: { id: true, type: true, content: true, videoAsset: { select: { id: true } } },
    }),
    getInstructorSummary(course.teacher.id, course.id),
  ]);

  const lessons = course.sections.flatMap((section) => section.lessons);
  const previews = new Map<string, LessonPreview>();
  for (const lesson of previewLessons) {
    if (lesson.type === "VIDEO" && lesson.videoAsset) previews.set(lesson.id, { kind: "video", videoId: lesson.videoAsset.id });
    else if (lesson.type === "TEXT" && lesson.content) previews.set(lesson.id, { kind: "text", content: lesson.content });
  }

  return {
    course,
    studentCount,
    rating: summarizeRatings(ratingGroups.map((g) => ({ rating: g.rating, count: g._count._all }))),
    reviews,
    previews,
    instructor,
    stats: {
      sectionCount: course.sections.length,
      lessonCount: lessons.length,
      videoCount: lessons.filter((l) => l.type === "VIDEO").length,
      articleCount: lessons.filter((l) => l.type === "TEXT").length,
      quizCount: course._count.quizzes,
      totalDurationSec: lessons.reduce((sum, l) => sum + (l.durationSec ?? 0), 0),
    },
  };
});

export type CourseLanding = NonNullable<Awaited<ReturnType<typeof getCourseLanding>>>;

/** The instructor card's numbers, across all of their published courses. */
async function getInstructorSummary(teacherId: string, currentCourseId: string) {
  const courses = await prisma.course.findMany({
    where: { teacherId, status: "PUBLISHED" },
    include: { category: true, teacher: { select: { name: true } } },
    orderBy: { publishedAt: "desc" },
  });
  const courseIds = courses.map((c) => c.id);
  const [students, rating] = await Promise.all([
    prisma.enrollment.findMany({
      where: { courseId: { in: courseIds }, status: "ACTIVE" },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.courseReview.aggregate({
      where: { courseId: { in: courseIds }, hidden: false },
      _avg: { rating: true },
      _count: true,
    }),
  ]);

  return {
    courseCount: courses.length,
    studentCount: students.length,
    rating: rating._count ? Math.round((rating._avg.rating ?? 0) * 10) / 10 : null,
    reviewCount: rating._count,
    otherCourses: courses.filter((c) => c.id !== currentCourseId).slice(0, 3),
  };
}
