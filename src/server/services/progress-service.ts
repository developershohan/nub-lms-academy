import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessLesson } from "@/lib/permissions";

/**
 * Brings Enrollment.completedAt in line with the course's CURRENT lessons - for one student after
 * their progress changes, or for every active enrollment after the curriculum changes. Completion
 * used to be set only when a student marked a lesson done and never cleared, so deleting a
 * course's last unfinished lesson never completed anyone and adding a lesson never un-completed
 * anyone. A student who already holds a certificate keeps completedAt: that completion was certified.
 */
export async function recomputeCourseCompletion(courseId: string, userId?: string) {
  const [totalLessons, enrollments] = await Promise.all([
    prisma.lesson.count({ where: { section: { courseId } } }),
    prisma.enrollment.findMany({
      where: { courseId, status: "ACTIVE", ...(userId ? { userId } : {}) },
      select: { userId: true, completedAt: true },
    }),
  ]);
  if (enrollments.length === 0) return;
  const userIds = enrollments.map((e) => e.userId);

  const [progress, certificates] = await Promise.all([
    prisma.lessonProgress.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, completed: true, lesson: { section: { courseId } } },
      _count: { _all: true },
    }),
    prisma.certificate.findMany({ where: { courseId, userId: { in: userIds } }, select: { userId: true } }),
  ]);
  const completedLessons = new Map(progress.map((p) => [p.userId, p._count._all]));
  const certified = new Set(certificates.map((c) => c.userId));

  const nowComplete: string[] = [];
  const noLongerComplete: string[] = [];
  for (const enrollment of enrollments) {
    const complete = totalLessons > 0 && (completedLessons.get(enrollment.userId) ?? 0) >= totalLessons;
    if (complete && !enrollment.completedAt) nowComplete.push(enrollment.userId);
    if (!complete && enrollment.completedAt && !certified.has(enrollment.userId)) {
      noLongerComplete.push(enrollment.userId);
    }
  }

  if (nowComplete.length) {
    await prisma.enrollment.updateMany({
      where: { courseId, userId: { in: nowComplete }, completedAt: null },
      data: { completedAt: new Date() },
    });
  }
  if (noLongerComplete.length) {
    await prisma.enrollment.updateMany({
      where: { courseId, userId: { in: noLongerComplete } },
      data: { completedAt: null },
    });
  }
}

export async function recordLessonProgress(
  userId: string,
  lessonId: string,
  watchedSeconds: number,
  completed: boolean
) {
  if (!(await canAccessLesson(userId, lessonId))) return { error: "Forbidden" } as const;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { section: { select: { courseId: true } } },
  });
  if (!lesson) return { error: "Not found" } as const;
  const courseId = lesson.section.courseId;

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, watchedSeconds, completed, completedAt: completed ? new Date() : null },
    update: { watchedSeconds, completed, completedAt: completed ? new Date() : null },
  });

  // Only on completion: progress pings with completed=false must not un-complete a finished course.
  if (completed) await recomputeCourseCompletion(courseId, userId);

  revalidatePath(`/student/course/${courseId}/learn`);
  revalidatePath("/student/dashboard");
  revalidatePath("/student/my-courses");
  return { ok: true, courseId } as const;
}

/**
 * Remembers that the student opened this lesson, so the player resumes here next time. Touches
 * only lastViewedAt - viewing never changes completion. Deliberately no revalidatePath: nothing
 * on screen changes, and re-rendering the player on every lesson open would be wasted work.
 */
export async function recordLessonView(userId: string, lessonId: string, now = new Date()) {
  if (!(await canAccessLesson(userId, lessonId))) return { error: "Forbidden" } as const;

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, lastViewedAt: now },
    update: { lastViewedAt: now },
  });
  return { ok: true } as const;
}

/** Floored, so a course shows 100% only when every lesson is actually done. */
export function progressPercent(completedLessons: number, totalLessons: number) {
  return totalLessons ? Math.floor((Math.min(completedLessons, totalLessons) / totalLessons) * 100) : 0;
}

export async function getCourseProgress(userId: string, courseId: string) {
  const [totalLessons, completedLessons, lastProgress] = await Promise.all([
    prisma.lesson.count({ where: { section: { courseId } } }),
    prisma.lessonProgress.count({ where: { userId, completed: true, lesson: { section: { courseId } } } }),
    // The last lesson opened in the player; rows from before lastViewedAt existed fall back to
    // their last progress update.
    prisma.lessonProgress.findFirst({
      where: { userId, lesson: { section: { courseId } } },
      orderBy: [{ lastViewedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      select: { lessonId: true },
    }),
  ]);
  return {
    totalLessons,
    completedLessons,
    percent: progressPercent(completedLessons, totalLessons),
    isComplete: totalLessons > 0 && completedLessons >= totalLessons,
    lastLessonId: lastProgress?.lessonId ?? null,
  };
}

export function getLessonProgressMap(userId: string, courseId: string) {
  return prisma.lessonProgress
    .findMany({ where: { userId, lesson: { section: { courseId } } } })
    .then((rows) => new Map(rows.map((r) => [r.lessonId, r])));
}
