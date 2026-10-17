import { describe, expect, it } from "vitest";
import {
  PUBLISH_RULES,
  getCourseChecklist,
  moveInList,
  studioHref,
  summariseInstructorCourses,
  type ChecklistCourse,
} from "./studio";

const lesson = (overrides: Partial<ChecklistCourse["sections"][number]["lessons"][number]> = {}) => ({
  type: "TEXT",
  durationSec: null,
  isPreview: false,
  ...overrides,
});

const complete: ChecklistCourse = {
  subtitle: "Build real apps with React",
  description: "x".repeat(PUBLISH_RULES.minDescriptionChars),
  categoryId: "cat",
  thumbnailUrl: null,
  targetAudience: null,
  outcomeCount: PUBLISH_RULES.minOutcomes,
  requirementCount: 0,
  sections: [{ lessons: [lesson(), lesson(), lesson()] }],
};

const open = (course: ChecklistCourse) =>
  getCourseChecklist(course)
    .items.filter((i) => !i.done)
    .map((i) => i.key);

describe("getCourseChecklist", () => {
  it("lists every required step for a brand-new course and isn't ready", () => {
    const checklist = getCourseChecklist({
      subtitle: null,
      description: null,
      categoryId: null,
      thumbnailUrl: null,
      targetAudience: null,
      outcomeCount: 0,
      requirementCount: 0,
      sections: [],
    });
    expect(checklist.ready).toBe(false);
    expect(checklist.requiredDone).toBe(1); // "no empty sections" holds when there are no sections
    expect(checklist.items.filter((i) => i.required && !i.done).map((i) => i.key)).toEqual([
      "subtitle",
      "description",
      "category",
      "outcomes",
      "lessons",
    ]);
  });

  it("is ready once the required steps are done, leaving only recommendations open", () => {
    const checklist = getCourseChecklist(complete);
    expect(checklist.ready).toBe(true);
    expect(checklist.requiredDone).toBe(checklist.requiredTotal);
    expect(open(complete)).toEqual(["thumbnail", "audience", "requirements", "preview"]);
  });

  it("counts characters after trimming, so padding can't fake a description", () => {
    const padded = { ...complete, description: ` ${"x".repeat(PUBLISH_RULES.minDescriptionChars - 1)}   ` };
    expect(open(padded)).toContain("description");
  });

  it("blocks an empty section even when there are enough lessons elsewhere", () => {
    const course = { ...complete, sections: [...complete.sections, { lessons: [] }] };
    expect(getCourseChecklist(course).ready).toBe(false);
    expect(open(course)).toContain("empty-sections");
  });

  it("recommends a length on every video lesson, ignoring text lessons", () => {
    const withVideo = { ...complete, sections: [{ lessons: [lesson(), lesson(), lesson({ type: "VIDEO" })] }] };
    expect(open(withVideo)).toContain("durations");
    const timed = { ...complete, sections: [{ lessons: [lesson(), lesson(), lesson({ type: "VIDEO", durationSec: 300 })] }] };
    expect(open(timed)).not.toContain("durations");
  });
});

describe("studioHref", () => {
  it("puts the overview at the course root and each section below it", () => {
    expect(studioHref("abc")).toBe("/teacher/courses/abc");
    expect(studioHref("abc", "curriculum")).toBe("/teacher/courses/abc/curriculum");
  });
});

describe("moveInList", () => {
  it("swaps an item with its neighbour", () => {
    expect(moveInList(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInList(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("returns null at the edges and for unknown ids, so callers skip the write", () => {
    expect(moveInList(["a", "b"], "a", "up")).toBeNull();
    expect(moveInList(["a", "b"], "b", "down")).toBeNull();
    expect(moveInList(["a", "b"], "z", "up")).toBeNull();
  });
});

describe("summariseInstructorCourses", () => {
  it("weights the average rating by each course's review count", () => {
    const totals = summariseInstructorCourses([
      { status: "PUBLISHED", students: 10, sales: 100, ratingAvg: 5, ratingCount: 3 },
      { status: "PUBLISHED", students: 5, sales: 50.5, ratingAvg: 3, ratingCount: 1 },
      { status: "DRAFT", students: 0, sales: 0, ratingAvg: 0, ratingCount: 0 },
    ]);
    expect(totals).toEqual({ students: 15, sales: 150.5, ratingAvg: 4.5, ratingCount: 4, published: 2 });
  });

  it("reports no rating rather than zero stars when nobody has reviewed", () => {
    expect(summariseInstructorCourses([]).ratingAvg).toBe(0);
    expect(summariseInstructorCourses([]).ratingCount).toBe(0);
  });
});
