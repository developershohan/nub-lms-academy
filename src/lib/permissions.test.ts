import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "../../test/prisma-mock";

vi.mock("@/lib/prisma", () => import("../../test/prisma-mock").then((m) => m.prismaModule()));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { prisma as prismaClient } from "@/lib/prisma";
import { canAccessCourse, canAccessLesson, canGenerateCertificate } from "./permissions";

const prisma = prismaClient as unknown as PrismaMock;

const student = { id: "student-1", status: "ACTIVE", roles: [{ role: { name: "STUDENT" } }] };

function givenCourse(status: string, extra: Record<string, unknown> = {}) {
  prisma.course.findUnique.mockResolvedValue({ teacherId: "teacher-1", status, isSubscriptionIncluded: false, ...extra });
}

beforeEach(() => {
  prisma.$reset();
  prisma.user.findUnique.mockResolvedValue(student);
});

describe("canAccessCourse", () => {
  it.each(["APPROVED", "ARCHIVED"])("keeps access for an enrolled student after the course becomes %s", async (status) => {
    givenCourse(status);
    prisma.enrollment.findUnique.mockResolvedValue({ status: "ACTIVE" });
    await expect(canAccessCourse("student-1", "course-1")).resolves.toBe(true);
  });

  it("denies a non-enrolled student on an unpublished course, even with a subscription", async () => {
    givenCourse("APPROVED", { isSubscriptionIncluded: true });
    prisma.enrollment.findUnique.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ status: "ACTIVE" });
    await expect(canAccessCourse("student-1", "course-1")).resolves.toBe(false);
  });

  it("denies an enrollment that was refunded", async () => {
    givenCourse("PUBLISHED");
    prisma.enrollment.findUnique.mockResolvedValue({ status: "REFUNDED" });
    await expect(canAccessCourse("student-1", "course-1")).resolves.toBe(false);
  });

  it("still grants subscription access on a published, subscription-included course", async () => {
    givenCourse("PUBLISHED", { isSubscriptionIncluded: true });
    prisma.enrollment.findUnique.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue({ status: "ACTIVE" });
    await expect(canAccessCourse("student-1", "course-1")).resolves.toBe(true);
  });
});

describe("canAccessLesson", () => {
  it("lets an enrolled student open lessons of an unpublished course", async () => {
    prisma.lesson.findUnique.mockResolvedValue({
      isPreview: false,
      section: { courseId: "course-1", course: { status: "APPROVED" } },
    });
    givenCourse("APPROVED");
    prisma.enrollment.findUnique.mockResolvedValue({ status: "ACTIVE" });
    await expect(canAccessLesson("student-1", "lesson-1")).resolves.toBe(true);
  });

  it("stops serving free previews of an unpublished course to the public", async () => {
    prisma.lesson.findUnique.mockResolvedValue({
      isPreview: true,
      section: { courseId: "course-1", course: { status: "APPROVED" } },
    });
    await expect(canAccessLesson(null, "lesson-1")).resolves.toBe(false);
  });
});

describe("canGenerateCertificate", () => {
  beforeEach(() => {
    prisma.enrollment.findUnique.mockResolvedValue({ status: "ACTIVE", completedAt: new Date() });
  });

  it("only counts live quizzes that have questions, so an empty or removed quiz can't block the certificate", async () => {
    prisma.quiz.findMany.mockResolvedValue([]);
    await expect(canGenerateCertificate("student-1", "course-1")).resolves.toBe(true);
    expect(prisma.quiz.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId: "course-1", archivedAt: null, questions: { some: {} } } })
    );
  });

  it("still requires every quiz with questions to be passed", async () => {
    prisma.quiz.findMany.mockResolvedValue([{ id: "quiz-1" }, { id: "quiz-2" }]);
    prisma.quizAttempt.findMany.mockResolvedValue([{ quizId: "quiz-1" }]);
    await expect(canGenerateCertificate("student-1", "course-1")).resolves.toBe(false);
  });

  it("does not depend on the course still being published", async () => {
    prisma.quiz.findMany.mockResolvedValue([]);
    await expect(canGenerateCertificate("student-1", "course-1")).resolves.toBe(true);
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });
});
