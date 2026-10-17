import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PUBLISH_RULES, summariseInstructorCourses } from "@/lib/studio";
import {
  moveLesson,
  moveSection,
  submitCourseForReview,
  updateCourseGoals,
  updateCourseLanding,
  updateCoursePricing,
} from "@/server/services/course-service";
import { getCoursePerformance, listInstructorCourses } from "@/server/services/studio-service";
import { createCourse, createUser, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
});

const landing = { title: "Modern React", level: "BEGINNER" as const, language: "English" };

async function lessonTitles(sectionId: string) {
  const lessons = await prisma.lesson.findMany({ where: { sectionId }, orderBy: { sortOrder: "asc" } });
  return lessons.map((l) => l.title);
}

describe("studio edits", () => {
  it("saves each part of the course and only for the owning teacher", async () => {
    const teacher = await createUser(["TEACHER"]);
    const otherTeacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id, { status: "DRAFT" });

    await expect(
      updateCourseLanding(course.id, otherTeacher.id, { ...landing, thumbnailUrl: "https://x.test/a.png" })
    ).resolves.toEqual({ error: "Forbidden" });

    await updateCourseLanding(course.id, teacher.id, { ...landing, subtitle: "Hooks to server components", thumbnailUrl: "https://x.test/a.png" });
    await updateCourseGoals(course.id, teacher.id, {
      outcomes: ["Build components", "Manage state"],
      requirements: ["JavaScript"],
      targetAudience: "Front-end developers",
    });

    const saved = await prisma.course.findUniqueOrThrow({
      where: { id: course.id },
      include: { outcomes: { orderBy: { sortOrder: "asc" } }, requirements: true },
    });
    expect(saved).toMatchObject({
      title: "Modern React",
      subtitle: "Hooks to server components",
      thumbnailUrl: "https://x.test/a.png",
      targetAudience: "Front-end developers",
    });
    expect(saved.outcomes.map((o) => o.content)).toEqual(["Build components", "Manage state"]);
    expect(saved.requirements.map((r) => r.content)).toEqual(["JavaScript"]);
  });

  it("re-prices a live course, keeps the charged price current and flags it for re-review", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id, { price: 40 });

    await updateCoursePricing(course.id, teacher.id, { price: 40, salePrice: 15 });

    const saved = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(Number(saved.effectivePrice)).toBe(15);
    expect(saved.changedSinceReviewAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetId: course.id } });
    expect(audit.metadata).toMatchObject({ change: "pricing", previousPrice: 40, salePrice: 15 });
  });
});

describe("curriculum reordering", () => {
  it("moves lessons within a section and renumbers them, ignoring moves past the ends", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id, { status: "DRAFT", lessons: 3 });
    const section = course.sections[0];
    const [first, , third] = [...section.lessons].sort((a, b) => a.sortOrder - b.sortOrder);

    await moveLesson(third.id, teacher.id, "up");
    expect(await lessonTitles(section.id)).toEqual(["Lesson 1", "Lesson 3", "Lesson 2"]);

    await expect(moveLesson(first.id, teacher.id, "up")).resolves.toEqual({ ok: true });
    expect(await lessonTitles(section.id)).toEqual(["Lesson 1", "Lesson 3", "Lesson 2"]);

    const sortOrders = (await prisma.lesson.findMany({ where: { sectionId: section.id } })).map((l) => l.sortOrder);
    expect(sortOrders.sort()).toEqual([0, 1, 2]);
  });

  it("moves sections, even when their stored order is tied", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id, { status: "DRAFT" });
    // Same sortOrder as the seeded section: creation time decides, as it does for students.
    const second = await prisma.courseSection.create({ data: { courseId: course.id, title: "Advanced", sortOrder: 0 } });

    await moveSection(second.id, teacher.id, "up");

    const sections = await prisma.courseSection.findMany({ where: { courseId: course.id }, orderBy: { sortOrder: "asc" } });
    expect(sections.map((s) => s.title)).toEqual(["Advanced", "Getting started"]);
    await expect(moveSection(second.id, (await createUser(["TEACHER"])).id, "down")).resolves.toEqual({ error: "Forbidden" });
  });
});

describe("submitting for review", () => {
  it("is blocked until the publish checklist's required steps are done", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id, { status: "DRAFT", lessons: PUBLISH_RULES.minLessons });

    const blocked = await submitCourseForReview(course.id, teacher.id);
    expect(blocked).toEqual({ error: "Finish the checklist before submitting: write a subtitle" });

    const category = await prisma.category.create({ data: { name: "Web", slug: "web" } });
    await updateCourseLanding(course.id, teacher.id, {
      ...landing,
      subtitle: "From first component to production",
      description: "d".repeat(PUBLISH_RULES.minDescriptionChars),
      categoryId: category.id,
    });
    await updateCourseGoals(course.id, teacher.id, { outcomes: ["One", "Two", "Three"], requirements: [] });

    await expect(submitCourseForReview(course.id, teacher.id)).resolves.toEqual({ ok: true });
    await expect(prisma.course.findUniqueOrThrow({ where: { id: course.id } })).resolves.toMatchObject({
      status: "IN_REVIEW",
    });
  });
});

describe("instructor numbers", () => {
  it("counts active students, completions and what paid orders actually brought in", async () => {
    const teacher = await createUser(["TEACHER"]);
    const course = await createCourse(teacher.id, { price: 50 });
    const otherCourse = await createCourse((await createUser(["TEACHER"])).id, { price: 30 });
    const [alice, bob, carol] = await Promise.all([createUser(), createUser(), createUser()]);

    await prisma.enrollment.createMany({
      data: [
        { userId: alice.id, courseId: course.id, source: "PURCHASE", completedAt: new Date() },
        { userId: bob.id, courseId: course.id, source: "PURCHASE" },
        { userId: carol.id, courseId: course.id, source: "PURCHASE", status: "REFUNDED" },
      ],
    });
    const order = (userId: string, status: "PAID" | "REFUNDED", subtotal: number, total: number, items: { courseId: string; price: number }[]) =>
      prisma.order.create({ data: { userId, status, subtotal, total, items: { create: items } } });
    // A 20% coupon across two courses: this teacher's share is 80% of $50.
    await order(alice.id, "PAID", 80, 64, [
      { courseId: course.id, price: 50 },
      { courseId: otherCourse.id, price: 30 },
    ]);
    await order(bob.id, "PAID", 50, 50, [{ courseId: course.id, price: 50 }]);
    await order(carol.id, "REFUNDED", 50, 50, [{ courseId: course.id, price: 50 }]);

    const [row] = await listInstructorCourses(teacher.id);
    expect(row).toMatchObject({ id: course.id, students: 2, completions: 1 });
    expect(row.sales).toBeCloseTo(90);
    expect(summariseInstructorCourses([row])).toMatchObject({ students: 2, published: 1 });

    const performance = await getCoursePerformance(course.id);
    expect(performance).toMatchObject({ students: 2, completions: 1 });
    expect(performance.sales).toBeCloseTo(90);
  });
});
