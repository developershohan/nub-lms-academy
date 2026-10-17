import Link from "next/link";
import { Check, ChevronDown, FileText, ListChecks, PlayCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { CenterInScrollContainer } from "@/components/learning/center-in-scroll-container";
import { formatLessonDuration, formatTotalDuration } from "@/lib/format";
import { learnHref, sectionProgress } from "@/lib/learning-path";
import { cn } from "@/lib/utils";

export type CurriculumSection = {
  id: string;
  title: string;
  lessons: { id: string; title: string; type: "VIDEO" | "TEXT"; durationSec: number | null }[];
};

export type CurriculumQuiz = { id: string; title: string; questionCount: number; passed: boolean };

function StatusDot({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-2.5" strokeWidth={3.5} aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "mt-0.5 size-4 shrink-0 rounded-full border-[1.5px]",
        current ? "border-amber-foreground/70 dark:border-amber" : "border-muted-foreground/40"
      )}
      aria-hidden
    />
  );
}

/** The course outline in the player: overall progress, then each section (done/total, length)
 * with its lessons. Sections are native <details>, open for the one holding the current lesson. */
export function CurriculumNav({
  courseId,
  sections,
  activeLessonId,
  completedIds,
  quizzes,
}: {
  courseId: string;
  sections: CurriculumSection[];
  activeLessonId: string;
  completedIds: ReadonlySet<string>;
  quizzes: CurriculumQuiz[];
}) {
  const totalLessons = sections.reduce((sum, s) => sum + s.lessons.length, 0);
  const doneLessons = sections.reduce((sum, s) => sum + sectionProgress(s.lessons, completedIds).done, 0);
  const percent = totalLessons ? Math.floor((doneLessons / totalLessons) * 100) : 0;
  const lessonNumbers = new Map(sections.flatMap((s) => s.lessons).map((l, i) => [l.id, i + 1]));

  return (
    <nav aria-label="Lessons" className="pb-8 text-sm">
      <div className="space-y-2 border-b px-4 py-3">
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{doneLessons}</span> of {totalLessons}{" "}
            {totalLessons === 1 ? "lesson" : "lessons"} complete
          </span>
          <span className="font-mono tabular-nums">{percent}%</span>
        </div>
        <Progress value={percent} aria-label="Course progress" />
      </div>

      {sections.map((section, sectionIndex) => {
        const progress = sectionProgress(section.lessons, completedIds);
        const sectionSec = section.lessons.reduce((sum, l) => sum + (l.durationSec ?? 0), 0);
        const holdsCurrent = section.lessons.some((l) => l.id === activeLessonId);
        return (
          <details key={section.id} open={holdsCurrent || sections.length === 1} className="group border-b">
            <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Section {sectionIndex + 1}
                </span>
                <span className="mt-0.5 block font-semibold leading-snug">{section.title}</span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {progress.complete && <Check className="size-3.5 text-primary" strokeWidth={3} aria-hidden />}
                  <span className="font-mono tabular-nums">
                    {progress.done}/{progress.total}
                  </span>
                  <span className="sr-only">lessons complete</span>
                  {sectionSec > 0 && <span aria-hidden>·</span>}
                  {sectionSec > 0 && <span>{formatTotalDuration(sectionSec)}</span>}
                </span>
              </span>
              <ChevronDown
                className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <ol className="pb-2">
              {section.lessons.map((lesson) => {
                const done = completedIds.has(lesson.id);
                const current = lesson.id === activeLessonId;
                const Icon = lesson.type === "VIDEO" ? PlayCircle : FileText;
                return (
                  <li key={lesson.id}>
                    <Link
                      href={learnHref(courseId, lesson.id)}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "relative flex gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60",
                        current &&
                          "bg-accent hover:bg-accent before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-amber"
                      )}
                    >
                      <StatusDot done={done} current={current} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block leading-snug", current ? "font-medium" : "text-foreground/85")}>
                          {lessonNumbers.get(lesson.id)}. {lesson.title}
                          {done && <span className="sr-only"> (completed)</span>}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon className="size-3.5" aria-hidden />
                          {lesson.type === "VIDEO" ? "Video" : "Article"}
                          {lesson.durationSec ? (
                            <span className="font-mono">· {formatLessonDuration(lesson.durationSec)}</span>
                          ) : null}
                        </span>
                      </span>
                      {current && <CenterInScrollContainer />}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </details>
        );
      })}

      {quizzes.length > 0 && (
        <div className="border-b pb-2">
          <p className="px-4 pt-4 pb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Quizzes</p>
          <ul>
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <Link href={`/student/quiz/${quiz.id}`} className="flex gap-3 px-4 py-2.5 hover:bg-muted/60">
                  {quiz.passed ? (
                    <StatusDot done current={false} />
                  ) : (
                    <ListChecks className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug text-foreground/85">{quiz.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {quiz.questionCount} {quiz.questionCount === 1 ? "question" : "questions"}
                      {quiz.passed && " · Passed"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
