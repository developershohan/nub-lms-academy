import { describe, expect, it } from "vitest";
import { firstUnfinishedLesson, learnHref, lessonPosition, pickActiveLesson, sectionProgress } from "./learning-path";

const sections = [
  { lessons: [{ id: "intro" }, { id: "setup" }] },
  { lessons: [] },
  { lessons: [{ id: "html" }, { id: "css" }] },
];

describe("lessonPosition", () => {
  it("crosses section boundaries (and skips empty sections) for previous and next", () => {
    expect(lessonPosition(sections, "setup")).toEqual({
      previous: { id: "intro" },
      next: { id: "html" },
      number: 2,
      total: 4,
    });
    expect(lessonPosition(sections, "html")?.previous).toEqual({ id: "setup" });
  });

  it("has no previous on the first lesson and no next on the last", () => {
    expect(lessonPosition(sections, "intro")?.previous).toBeNull();
    expect(lessonPosition(sections, "css")?.next).toBeNull();
  });

  it("returns null for a lesson outside the course", () => {
    expect(lessonPosition(sections, "other-course-lesson")).toBeNull();
  });
});

describe("pickActiveLesson", () => {
  const none = new Set<string>();

  it("opens the requested lesson when it belongs to the course", () => {
    expect(pickActiveLesson(sections, { requestedId: "css", lastViewedId: "setup", completedIds: none })?.id).toBe("css");
  });

  it("resumes the last viewed lesson when none (or a foreign one) is requested", () => {
    expect(pickActiveLesson(sections, { lastViewedId: "html", completedIds: none })?.id).toBe("html");
    expect(pickActiveLesson(sections, { requestedId: "nope", lastViewedId: "html", completedIds: none })?.id).toBe(
      "html"
    );
  });

  it("falls back to the first unfinished lesson, then the first lesson", () => {
    expect(pickActiveLesson(sections, { completedIds: new Set(["intro", "setup"]) })?.id).toBe("html");
    expect(pickActiveLesson(sections, { lastViewedId: "deleted", completedIds: none })?.id).toBe("intro");
    expect(pickActiveLesson(sections, { completedIds: new Set(["intro", "setup", "html", "css"]) })?.id).toBe("intro");
  });

  it("returns null for a course without lessons", () => {
    expect(pickActiveLesson([{ lessons: [] }], { completedIds: none })).toBeNull();
  });
});

describe("firstUnfinishedLesson", () => {
  it("finds the earliest gap, ignoring the lesson the student is on", () => {
    expect(firstUnfinishedLesson(sections, new Set(["intro", "html"]), "css")?.id).toBe("setup");
    expect(firstUnfinishedLesson(sections, new Set(["intro", "setup", "html"]), "css")).toBeNull();
  });
});

describe("sectionProgress", () => {
  it("counts done out of total and flags a finished section", () => {
    const lessons = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(sectionProgress(lessons, new Set(["a", "c", "elsewhere"]))).toEqual({ done: 2, total: 3, complete: false });
    expect(sectionProgress(lessons, new Set(["a", "b", "c"]))).toEqual({ done: 3, total: 3, complete: true });
    expect(sectionProgress([], new Set())).toEqual({ done: 0, total: 0, complete: false });
  });
});

describe("learnHref", () => {
  it("links to the player, with the lesson in the query string", () => {
    expect(learnHref("c1")).toBe("/student/course/c1/learn");
    expect(learnHref("c1", "l2")).toBe("/student/course/c1/learn?lesson=l2");
  });
});
