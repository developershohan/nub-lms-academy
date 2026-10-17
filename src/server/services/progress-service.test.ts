import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ canAccessLesson: vi.fn().mockResolvedValue(true) }));

import { prisma as prismaClient } from "@/lib/prisma";
import { canAccessLesson } from "@/lib/permissions";
import { getCourseProgress, progressPercent, recomputeCourseCompletion, recordLessonView } from "./progress-service";

const prisma = prismaClient as unknown as PrismaMock;
const done = new Date("2026-09-01");

function givenCourse({
  totalLessons,
  enrollments,
  completedLessons,
  certifiedUserIds = [],
}: {
  totalLessons: number;
  enrollments: { userId: string; completedAt: Date | null }[];
  completedLessons: Record<string, number>;
  certifiedUserIds?: string[];
}) {
  prisma.lesson.count.mockResolvedValue(totalLessons);
  prisma.enrollment.findMany.mockResolvedValue(enrollments);
  prisma.lessonProgress.groupBy.mockResolvedValue(
    Object.entries(completedLessons).map(([userId, count]) => ({ userId, _count: { _all: count } }))
  );
  prisma.certificate.findMany.mockResolvedValue(certifiedUserIds.map((userId) => ({ userId })));
}

beforeEach(() => prisma.$reset());

describe("recomputeCourseCompletion", () => {
  it("completes students whose only unfinished lesson was deleted", async () => {
    // 3 lessons left after the teacher deleted the 4th - "amina" had done the other three.
    givenCourse({
      totalLessons: 3,
      enrollments: [
        { userId: "amina", completedAt: null },
        { userId: "babul", completedAt: null },
      ],
      completedLessons: { amina: 3, babul: 1 },
    });

    await recomputeCourseCompletion("course-1");

    expect(prisma.enrollment.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { courseId: "course-1", userId: { in: ["amina"] }, completedAt: null },
      data: { completedAt: expect.any(Date) },
    });
  });

  it("un-completes students when a lesson is added, unless they already hold a certificate", async () => {
    givenCourse({
      totalLessons: 4,
      enrollments: [
        { userId: "amina", completedAt: done },
        { userId: "certified", completedAt: done },
      ],
      completedLessons: { amina: 3, certified: 3 },
      certifiedUserIds: ["certified"],
    });

    await recomputeCourseCompletion("course-1");

    expect(prisma.enrollment.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
      where: { courseId: "course-1", userId: { in: ["amina"] } },
      data: { completedAt: null },
    });
  });

  it("never completes anyone on a course with no lessons", async () => {
    givenCourse({ totalLessons: 0, enrollments: [{ userId: "amina", completedAt: null }], completedLessons: {} });

    await recomputeCourseCompletion("course-1");

    expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
  });
});

describe("recordLessonView", () => {
  const now = new Date("2026-10-17T12:00:00Z");

  it("stamps lastViewedAt without touching completion", async () => {
    await expect(recordLessonView("amina", "lesson-3", now)).resolves.toEqual({ ok: true });

    expect(prisma.lessonProgress.upsert).toHaveBeenCalledWith({
      where: { userId_lessonId: { userId: "amina", lessonId: "lesson-3" } },
      create: { userId: "amina", lessonId: "lesson-3", lastViewedAt: now },
      update: { lastViewedAt: now },
    });
  });

  it("ignores lessons the student can't access", async () => {
    vi.mocked(canAccessLesson).mockResolvedValueOnce(false);

    await expect(recordLessonView("amina", "lesson-3", now)).resolves.toEqual({ error: "Forbidden" });
    expect(prisma.lessonProgress.upsert).not.toHaveBeenCalled();
  });
});

describe("getCourseProgress", () => {
  it("resumes from the most recently viewed lesson", async () => {
    prisma.lesson.count.mockResolvedValue(4);
    prisma.lessonProgress.count.mockResolvedValue(1);
    prisma.lessonProgress.findFirst.mockResolvedValue({ lessonId: "lesson-3" });

    await expect(getCourseProgress("amina", "course-1")).resolves.toEqual({
      totalLessons: 4,
      completedLessons: 1,
      percent: 25,
      isComplete: false,
      lastLessonId: "lesson-3",
    });
    expect(prisma.lessonProgress.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ lastViewedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      })
    );
  });

  it("is complete only when every lesson is done", async () => {
    prisma.lesson.count.mockResolvedValue(3);
    prisma.lessonProgress.count.mockResolvedValue(3);
    prisma.lessonProgress.findFirst.mockResolvedValue(null);

    await expect(getCourseProgress("amina", "course-1")).resolves.toMatchObject({
      percent: 100,
      isComplete: true,
      lastLessonId: null,
    });
  });
});

describe("progressPercent", () => {
  it("rounds down, so 100% always means finished", () => {
    expect(progressPercent(199, 200)).toBe(99);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 2)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });
});
