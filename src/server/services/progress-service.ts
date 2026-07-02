import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessLesson } from "@/lib/permissions";

async function maybeCompleteCourse(userId: string, courseId: string) {
  const [totalLessons, completedLessons] = await Promise.all([
    prisma.lesson.count({ where: { section: { courseId } } }),
    prisma.lessonProgress.count({ where: { userId, completed: true, lesson: { section: { courseId } } } }),
  ]);
  if (totalLessons > 0 && totalLessons === completedLessons) {
    await prisma.enrollment.updateMany({
      where: { userId, courseId, completedAt: null },
      data: { completedAt: new Date() },
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

  if (completed) await maybeCompleteCourse(userId, courseId);

  revalidatePath(`/student/course/${courseId}/learn`);
  revalidatePath("/student/dashboard");
  revalidatePath("/student/my-courses");
  return { ok: true } as const;
}

export async function getCourseProgress(userId: string, courseId: string) {
  const [totalLessons, completedLessons, lastProgress] = await Promise.all([
    prisma.lesson.count({ where: { section: { courseId } } }),
    prisma.lessonProgress.count({ where: { userId, completed: true, lesson: { section: { courseId } } } }),
    prisma.lessonProgress.findFirst({
      where: { userId, lesson: { section: { courseId } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return {
    totalLessons,
    completedLessons,
    percent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
    lastLessonId: lastProgress?.lessonId ?? null,
  };
}

export function getLessonProgressMap(userId: string, courseId: string) {
  return prisma.lessonProgress
    .findMany({ where: { userId, lesson: { section: { courseId } } } })
    .then((rows) => new Map(rows.map((r) => [r.lessonId, r])));
}
