import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseCatalogParams } from "@/lib/catalog";
import { searchCatalog } from "@/server/services/catalog-service";
import { refreshCourseStats } from "@/server/services/course-stats-service";
import { createLesson, updateCourseDetails } from "@/server/services/course-service";
import { submitReview } from "@/server/services/review-service";
import { createCourse, createUser, resetDatabase } from "./db";

const search = (query: Record<string, string>) => searchCatalog(parseCatalogParams(query));
const titles = (result: Awaited<ReturnType<typeof search>>) => result.courses.map((c) => c.title);

beforeEach(async () => {
  await resetDatabase();
});

describe("course stats", () => {
  it("keeps rating, length, lesson count and the charged price current as content changes", async () => {
    const teacher = await createUser(["TEACHER"]);
    const student = await createUser();
    const course = await createCourse(teacher.id, { price: 40, lessons: 2 });
    await refreshCourseStats(course.id);
    await prisma.enrollment.create({ data: { userId: student.id, courseId: course.id, source: "PURCHASE" } });

    await createLesson(course.sections[0].id, teacher.id, { title: "Bonus", type: "TEXT", content: "x", durationSec: 600 });
    await submitReview(student.id, course.id, course.slug, 4, "Good");
    await updateCourseDetails(course.id, teacher.id, {
      title: course.title,
      level: "BEGINNER",
      language: "English",
      price: 40,
      salePrice: 25,
    });

    await expect(prisma.course.findUniqueOrThrow({ where: { id: course.id } })).resolves.toMatchObject({
      lessonCount: 3,
      totalDurationSec: 600,
      ratingAvg: 4,
      ratingCount: 1,
    });
    const { effectivePrice } = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(Number(effectivePrice)).toBe(25);
  });
});

describe("searchCatalog", () => {
  async function catalogue() {
    const teacher = await prisma.user.update({
      where: { id: (await createUser(["TEACHER"])).id },
      data: { name: "Naima Islam" },
    });
    const react = await createCourse(teacher.id, { price: 50 });
    const css = await createCourse(teacher.id, { price: 0 });
    const draft = await createCourse(teacher.id, { price: 10, status: "DRAFT" });
    await prisma.course.update({ where: { id: react.id }, data: { title: "Modern React", level: "INTERMEDIATE", ratingAvg: 4.7, ratingCount: 10 } });
    await prisma.course.update({ where: { id: css.id }, data: { title: "CSS Basics", level: "BEGINNER", ratingAvg: 3.9, ratingCount: 4 } });
    await prisma.course.update({ where: { id: draft.id }, data: { title: "Draft React" } });
    for (const id of [react.id, css.id, draft.id]) await refreshCourseStats(id);
    // refreshCourseStats recomputes ratings from reviews (there are none here), so set them after.
    await prisma.course.update({ where: { id: react.id }, data: { ratingAvg: 4.7, ratingCount: 10 } });
    await prisma.course.update({ where: { id: css.id }, data: { ratingAvg: 3.9, ratingCount: 4 } });
  }

  it("never shows unpublished courses and searches titles and instructor names", async () => {
    await catalogue();
    expect(titles(await search({ q: "react" }))).toEqual(["Modern React"]);
    expect(titles(await search({ q: "naima" })).sort()).toEqual(["CSS Basics", "Modern React"]);
  });

  it("filters by price and rating and sorts by the price actually charged", async () => {
    await catalogue();
    expect(titles(await search({ price: "free" }))).toEqual(["CSS Basics"]);
    expect(titles(await search({ rating: "4.5" }))).toEqual(["Modern React"]);
    expect(titles(await search({ sort: "price-desc" }))).toEqual(["Modern React", "CSS Basics"]);
  });

  it("counts each filter option as if it were picked, keeping the other filters", async () => {
    await catalogue();
    const { facets } = await search({ level: "BEGINNER" });
    expect(facets.levels.find((l) => l.value === "INTERMEDIATE")?.count).toBe(1);
    expect(facets.prices.find((p) => p.value === "paid")?.count).toBe(0);
  });
});
