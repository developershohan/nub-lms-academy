import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { refreshCourseStats } from "@/server/services/course-stats-service";
import {
  getBecauseYouViewed,
  getFavouriteCategory,
  listContinueLearning,
  listOwnedCourseIds,
  listTopInstructors,
  listTrendingCourses,
  recordCourseView,
} from "@/server/services/home-service";
import { createCourse, createUser, resetDatabase } from "./db";

beforeEach(async () => {
  await resetDatabase();
});

/** One at a time: createUser connects-or-creates the role row, which races when run in parallel. */
async function createUsers(count: number, roles?: Parameters<typeof createUser>[0]) {
  const users = [];
  for (let i = 0; i < count; i++) users.push(await createUser(roles));
  return users;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

async function category(slug: string) {
  return prisma.category.create({ data: { name: slug, slug } });
}

async function course(teacherId: string, title: string, options: { categoryId?: string; status?: "PUBLISHED" | "DRAFT"; lessons?: number } = {}) {
  const created = await createCourse(teacherId, { status: options.status, lessons: options.lessons });
  await prisma.course.update({ where: { id: created.id }, data: { title, categoryId: options.categoryId ?? null } });
  await refreshCourseStats(created.id);
  return created;
}

async function enroll(userId: string, courseId: string, enrolledAt = new Date(), extra: { completedAt?: Date } = {}) {
  await prisma.enrollment.create({ data: { userId, courseId, source: "PURCHASE", enrolledAt, ...extra } });
}

describe("continue learning", () => {
  it("lists unfinished courses, most recently studied first, with the lesson to resume", async () => {
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const older = await course(teacher.id, "Older", { lessons: 4 });
    const recent = await course(teacher.id, "Recent", { lessons: 2 });
    const untouched = await course(teacher.id, "Untouched");
    const finished = await course(teacher.id, "Finished");
    await enroll(student.id, older.id, daysAgo(10));
    await enroll(student.id, recent.id, daysAgo(20));
    await enroll(student.id, untouched.id, daysAgo(1));
    await enroll(student.id, finished.id, daysAgo(5), { completedAt: daysAgo(2) });

    const [o1, o2] = older.sections[0].lessons.sort((a, b) => a.sortOrder - b.sortOrder);
    const [r1] = recent.sections[0].lessons;
    await prisma.lessonProgress.createMany({
      data: [
        { userId: student.id, lessonId: o1.id, completed: true, lastViewedAt: daysAgo(3) },
        { userId: student.id, lessonId: o2.id, lastViewedAt: daysAgo(2) },
        { userId: student.id, lessonId: r1.id, lastViewedAt: daysAgo(1) },
      ],
    });

    const items = await listContinueLearning(student.id, 5);
    expect(items.map((i) => i.course.title)).toEqual(["Recent", "Older", "Untouched"]);
    expect(items[1]).toMatchObject({ percent: 25, lastLesson: { id: o2.id } });
    expect(items[2].lastLesson).toBeNull();
  });
});

describe("because you viewed", () => {
  it("recommends the best-rated courses in the category of the last course viewed but not owned", async () => {
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const web = await category("web");
    const data = await category("data");
    const viewed = await course(teacher.id, "Viewed", { categoryId: web.id });
    const owned = await course(teacher.id, "Owned", { categoryId: web.id });
    const good = await course(teacher.id, "Good", { categoryId: web.id });
    const better = await course(teacher.id, "Better", { categoryId: web.id });
    await course(teacher.id, "Other topic", { categoryId: data.id });
    await course(teacher.id, "Draft", { categoryId: web.id, status: "DRAFT" });
    await prisma.course.update({ where: { id: good.id }, data: { ratingAvg: 4.1 } });
    await prisma.course.update({ where: { id: better.id }, data: { ratingAvg: 4.8 } });
    await enroll(student.id, owned.id);

    await recordCourseView(student.id, viewed.id, daysAgo(1));
    // The latest view is a course they already own, so it is skipped.
    await recordCourseView(student.id, owned.id, new Date());

    const result = await getBecauseYouViewed(student.id, await listOwnedCourseIds(student.id));
    expect(result?.basedOn.title).toBe("Viewed");
    expect(result?.courses.map((c) => c.title)).toEqual(["Better", "Good"]);
  });

  it("has nothing to say before the student has viewed anything", async () => {
    const student = await createUser();
    await expect(getBecauseYouViewed(student.id, new Set())).resolves.toBeNull();
  });
});

describe("trending", () => {
  it("ranks by enrollments in the window, within a category, topping up quiet weeks with rated courses", async () => {
    const teacher = await createUser(["TEACHER"]);
    const web = await category("web");
    const hot = await course(teacher.id, "Hot", { categoryId: web.id });
    const warm = await course(teacher.id, "Warm", { categoryId: web.id });
    const oldFavourite = await course(teacher.id, "Old favourite", { categoryId: web.id });
    const elsewhere = await course(teacher.id, "Elsewhere");
    await prisma.course.update({ where: { id: oldFavourite.id }, data: { ratingCount: 50, ratingAvg: 4.9 } });

    const students = await createUsers(4);
    for (const s of students.slice(0, 3)) await enroll(s.id, hot.id, daysAgo(2));
    await enroll(students[3].id, warm.id, daysAgo(5));
    // Popular long ago: outside the 30-day window.
    for (const s of students) await enroll(s.id, oldFavourite.id, daysAgo(90));
    for (const s of students) await enroll(s.id, elsewhere.id, daysAgo(1));

    const trending = await listTrendingCourses({ categoryId: web.id, take: 3 });
    expect(trending.map((c) => c.title)).toEqual(["Hot", "Warm", "Old favourite"]);
    expect((await listTrendingCourses({ take: 1 })).map((c) => c.title)).toEqual(["Elsewhere"]);
  });
});

describe("top instructors and interests", () => {
  it("ranks instructors by active students on published courses", async () => {
    const [ana, ben] = await createUsers(2, ["TEACHER"]);
    await prisma.user.update({ where: { id: ana.id }, data: { name: "Ana" } });
    await prisma.user.update({ where: { id: ben.id }, data: { name: "Ben" } });
    const anaCourse = await course(ana.id, "Ana 1");
    const benCourse = await course(ben.id, "Ben 1");
    const benDraft = await course(ben.id, "Ben draft", { status: "DRAFT" });
    const students = await createUsers(3);
    await enroll(students[0].id, anaCourse.id);
    await enroll(students[1].id, anaCourse.id);
    await enroll(students[2].id, benCourse.id);
    // Students on a draft (e.g. added by hand) don't count towards the public ranking.
    for (const s of students) await enroll(s.id, benDraft.id);

    const top = await listTopInstructors(2);
    expect(top.map((t) => [t.name, t.students, t.courses])).toEqual([
      ["Ana", 2, 1],
      ["Ben", 1, 1],
    ]);
  });

  it("picks the category a student enrolls and browses in most", async () => {
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const web = await category("web");
    const data = await category("data");
    await enroll(student.id, (await course(teacher.id, "W", { categoryId: web.id })).id);
    await recordCourseView(student.id, (await course(teacher.id, "D1", { categoryId: data.id })).id);
    await recordCourseView(student.id, (await course(teacher.id, "D2", { categoryId: data.id })).id);
    await recordCourseView(student.id, (await course(teacher.id, "D3", { categoryId: data.id })).id);

    await expect(getFavouriteCategory(student.id)).resolves.toMatchObject({ slug: "data" });
  });
});
