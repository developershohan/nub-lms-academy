import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  canManageCourse: vi.fn().mockResolvedValue(true),
  canAdminAccess: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/server/services/progress-service", () => ({ recomputeCourseCompletion: vi.fn() }));
vi.mock("@/server/services/notification-service", () => ({ createNotifications: vi.fn() }));

import { prisma as prismaClient } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createNotifications } from "@/server/services/notification-service";
import { approveCourse, markCourseReviewed, updateLesson } from "./course-service";

const prisma = prismaClient as unknown as PrismaMock;
const videoLesson = { title: "Intro", type: "VIDEO" as const, videoUrl: "https://example.com/other-video" };

function givenLessonInCourse(course: { status: string; changedSinceReviewAt: Date | null }) {
  prisma.lesson.findUnique.mockResolvedValue({ section: { courseId: "course-1" } });
  prisma.course.findUnique.mockResolvedValue({ title: "Web Basics", ...course });
  prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);
}

beforeEach(() => {
  prisma.$reset();
  vi.clearAllMocks();
});

describe("edits after review", () => {
  it("flags a published course for re-review when a teacher swaps a lesson's video", async () => {
    givenLessonInCourse({ status: "PUBLISHED", changedSinceReviewAt: null });

    await updateLesson("lesson-1", "teacher-1", videoLesson);

    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { changedSinceReviewAt: expect.any(Date) },
    });
    expect(logAudit).toHaveBeenCalledWith(
      "teacher-1",
      "course:changed-after-review",
      "Course",
      "course-1",
      expect.objectContaining({ change: "lesson edited", videoUrl: "https://example.com/other-video" })
    );
    expect(createNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ userId: "admin-1", link: "/admin/courses" }),
      expect.objectContaining({ userId: "admin-2" }),
    ]);
  });

  it("logs further changes but only notifies admins once per round", async () => {
    givenLessonInCourse({ status: "PUBLISHED", changedSinceReviewAt: new Date("2026-10-16") });

    await updateLesson("lesson-1", "teacher-1", videoLesson);

    expect(logAudit).toHaveBeenCalled();
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it("leaves drafts alone - they're reviewed when submitted", async () => {
    givenLessonInCourse({ status: "DRAFT", changedSinceReviewAt: null });

    await updateLesson("lesson-1", "teacher-1", videoLesson);

    expect(prisma.course.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("clears the flag when an admin marks the changes reviewed or approves the course", async () => {
    prisma.course.findUnique.mockResolvedValue({ slug: "web-basics", status: "IN_REVIEW" });

    await markCourseReviewed("admin-1", "course-1");
    expect(prisma.course.update).toHaveBeenLastCalledWith({ where: { id: "course-1" }, data: { changedSinceReviewAt: null } });

    await approveCourse("admin-1", "course-1");
    expect(prisma.course.update).toHaveBeenLastCalledWith({
      where: { id: "course-1" },
      data: { status: "APPROVED", changedSinceReviewAt: null },
    });
  });
});
