/*
 * The instructor studio: one page per part of a course, plus the publish checklist that decides
 * when a course is ready to submit for review. Pure helpers only, so pages, services and tests
 * all agree on the same rules.
 */

export const STUDIO_SECTIONS = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "landing", label: "Landing page", segment: "landing" },
  { key: "goals", label: "Intended learners", segment: "goals" },
  { key: "curriculum", label: "Curriculum", segment: "curriculum" },
  { key: "quizzes", label: "Quizzes", segment: "quizzes" },
  { key: "pricing", label: "Pricing", segment: "pricing" },
] as const;

export type StudioSectionKey = (typeof STUDIO_SECTIONS)[number]["key"];

export function studioHref(courseId: string, section: StudioSectionKey = "overview") {
  const segment = STUDIO_SECTIONS.find((s) => s.key === section)!.segment;
  return `/teacher/courses/${courseId}${segment ? `/${segment}` : ""}`;
}

export const PUBLISH_RULES = {
  minSubtitleChars: 10,
  minDescriptionChars: 200,
  minOutcomes: 3,
  minLessons: 3,
} as const;

export type ChecklistCourse = {
  subtitle: string | null;
  description: string | null;
  categoryId: string | null;
  thumbnailUrl: string | null;
  targetAudience: string | null;
  outcomeCount: number;
  requirementCount: number;
  sections: { lessons: { type: string; durationSec: number | null; isPreview: boolean }[] }[];
};

export type ChecklistItem = {
  key: string;
  label: string;
  hint: string;
  section: StudioSectionKey;
  /** Required items block "Submit for review"; the rest are recommendations. */
  required: boolean;
  done: boolean;
};

export type CourseChecklist = {
  items: ChecklistItem[];
  requiredDone: number;
  requiredTotal: number;
  /** Every required item is done, so the course can be submitted for review. */
  ready: boolean;
};

export function getCourseChecklist(course: ChecklistCourse): CourseChecklist {
  const lessons = course.sections.flatMap((s) => s.lessons);
  const videos = lessons.filter((l) => l.type === "VIDEO");
  const length = (text: string | null) => (text ?? "").trim().length;

  const items: ChecklistItem[] = [
    {
      key: "subtitle",
      label: "Write a subtitle",
      hint: "One line under the title that says what students will be able to do.",
      section: "landing",
      required: true,
      done: length(course.subtitle) >= PUBLISH_RULES.minSubtitleChars,
    },
    {
      key: "description",
      label: `Describe the course in at least ${PUBLISH_RULES.minDescriptionChars} characters`,
      hint: "Cover what the course teaches, how it is taught and what students build.",
      section: "landing",
      required: true,
      done: length(course.description) >= PUBLISH_RULES.minDescriptionChars,
    },
    {
      key: "category",
      label: "Choose a category",
      hint: "Students browse and filter the catalogue by category.",
      section: "landing",
      required: true,
      done: !!course.categoryId,
    },
    {
      key: "outcomes",
      label: `List at least ${PUBLISH_RULES.minOutcomes} things students will learn`,
      hint: "These appear as \"What you'll learn\" on the course page.",
      section: "goals",
      required: true,
      done: course.outcomeCount >= PUBLISH_RULES.minOutcomes,
    },
    {
      key: "lessons",
      label: `Add at least ${PUBLISH_RULES.minLessons} lessons`,
      hint: "Short, focused lessons are easier to follow and to come back to.",
      section: "curriculum",
      required: true,
      done: lessons.length >= PUBLISH_RULES.minLessons,
    },
    {
      key: "empty-sections",
      label: "Give every section at least one lesson",
      hint: "Empty sections look unfinished to students.",
      section: "curriculum",
      required: true,
      done: course.sections.every((s) => s.lessons.length > 0),
    },
    {
      key: "thumbnail",
      label: "Add a course image",
      hint: "Courses with their own image stand out in the catalogue.",
      section: "landing",
      required: false,
      done: !!course.thumbnailUrl,
    },
    {
      key: "audience",
      label: "Describe who the course is for",
      hint: "Helps the right students pick it, and the wrong ones skip it.",
      section: "goals",
      required: false,
      done: length(course.targetAudience) > 0,
    },
    {
      key: "requirements",
      label: "List requirements or prerequisites",
      hint: "Tools, accounts or knowledge students need before they start.",
      section: "goals",
      required: false,
      done: course.requirementCount > 0,
    },
    {
      key: "preview",
      label: "Make at least one lesson a free preview",
      hint: "A free sample is the best way to show your teaching style.",
      section: "curriculum",
      required: false,
      done: lessons.some((l) => l.isPreview),
    },
    {
      key: "durations",
      label: "Set a length for every video lesson",
      hint: "Lengths add up to the course total shown in the catalogue.",
      section: "curriculum",
      required: false,
      done: videos.every((l) => (l.durationSec ?? 0) > 0),
    },
  ];

  const required = items.filter((i) => i.required);
  const requiredDone = required.filter((i) => i.done).length;
  return { items, requiredDone, requiredTotal: required.length, ready: requiredDone === required.length };
}

/** Dashboard totals across a teacher's courses. The rating is weighted by each course's review count. */
export function summariseInstructorCourses(
  courses: { status: string; students: number; sales: number; ratingAvg: number; ratingCount: number }[]
) {
  const ratingCount = courses.reduce((sum, c) => sum + c.ratingCount, 0);
  const ratingTotal = courses.reduce((sum, c) => sum + c.ratingAvg * c.ratingCount, 0);
  return {
    students: courses.reduce((sum, c) => sum + c.students, 0),
    sales: courses.reduce((sum, c) => sum + c.sales, 0),
    ratingAvg: ratingCount > 0 ? Math.round((ratingTotal / ratingCount) * 100) / 100 : 0,
    ratingCount,
    published: courses.filter((c) => c.status === "PUBLISHED").length,
  };
}

/**
 * The ids in their new order after moving `id` one place up or down, or null when it can't move
 * (already first/last, or not in the list) - callers then have nothing to write.
 */
export function moveInList(ids: string[], id: string, direction: "up" | "down"): string[] | null {
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
