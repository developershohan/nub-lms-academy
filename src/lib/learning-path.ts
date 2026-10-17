/**
 * Pure helpers for moving through a course in the learning player: lesson order, previous/next,
 * which lesson to open, and per-section progress. The curriculum comes in already sorted
 * (sections by sortOrder, lessons by sortOrder - see getCourseForLearning).
 */

type Outline<L extends { id: string }> = { lessons: L[] }[];

/** Cookie remembering that the student hid the curriculum sidebar ("closed"), read on the server
 * so the player renders in the right state without a flash. */
export const LEARN_SIDEBAR_COOKIE = "learn-sidebar";

export function learnHref(courseId: string, lessonId?: string) {
  const base = `/student/course/${courseId}/learn`;
  return lessonId ? `${base}?lesson=${encodeURIComponent(lessonId)}` : base;
}

/** Where a lesson sits in the course: its neighbours and its 1-based position. */
export function lessonPosition<L extends { id: string }>(sections: Outline<L>, lessonId: string) {
  const lessons = sections.flatMap((s) => s.lessons);
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) return null;
  return {
    previous: lessons[index - 1] ?? null,
    next: lessons[index + 1] ?? null,
    number: index + 1,
    total: lessons.length,
  };
}

/**
 * The lesson the player opens: the one asked for in the URL if it belongs to this course, else
 * the one the student last viewed (resume), else their first unfinished lesson, else the first.
 */
export function pickActiveLesson<L extends { id: string }>(
  sections: Outline<L>,
  {
    requestedId,
    lastViewedId,
    completedIds,
  }: { requestedId?: string | null; lastViewedId?: string | null; completedIds: ReadonlySet<string> }
): L | null {
  const lessons = sections.flatMap((s) => s.lessons);
  const byId = (id: string | null | undefined) => (id ? lessons.find((l) => l.id === id) : undefined);
  return (
    byId(requestedId) ?? byId(lastViewedId) ?? lessons.find((l) => !completedIds.has(l.id)) ?? lessons[0] ?? null
  );
}

/** The first unfinished lesson that isn't `exceptId` - where to send a student who reached the
 * end of the course with gaps behind them. */
export function firstUnfinishedLesson<L extends { id: string }>(
  sections: Outline<L>,
  completedIds: ReadonlySet<string>,
  exceptId?: string
): L | null {
  return sections.flatMap((s) => s.lessons).find((l) => l.id !== exceptId && !completedIds.has(l.id)) ?? null;
}

export function sectionProgress(lessons: { id: string }[], completedIds: ReadonlySet<string>) {
  const done = lessons.filter((l) => completedIds.has(l.id)).length;
  return { done, total: lessons.length, complete: lessons.length > 0 && done === lessons.length };
}
