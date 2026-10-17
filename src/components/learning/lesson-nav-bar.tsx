import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkCompleteButton } from "@/components/learning/mark-complete-button";
import { learnHref } from "@/lib/learning-path";

type LessonLink = { id: string; title: string };

function StepButton({ courseId, lesson, direction }: { courseId: string; lesson: LessonLink | null; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const label = direction === "previous" ? "Previous lesson" : "Next lesson";
  if (!lesson) {
    return (
      <Button variant="outline" size="icon-lg" disabled aria-label={label}>
        <Icon aria-hidden />
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="icon-lg"
      render={<Link href={learnHref(courseId, lesson.id)} />}
      aria-label={`${label}: ${lesson.title}`}
      title={lesson.title}
    >
      <Icon aria-hidden />
    </Button>
  );
}

/** Previous / next, what comes next, and the lesson's completion action. */
export function LessonNavBar({
  courseId,
  lessonId,
  watchedSeconds,
  previous,
  next,
  completed,
  firstUnfinished,
}: {
  courseId: string;
  lessonId: string;
  watchedSeconds: number;
  previous: LessonLink | null;
  next: LessonLink | null;
  completed: boolean;
  /** The first lesson other than this one still to do, or null if this is the last one left. */
  firstUnfinished: LessonLink | null;
}) {
  const completeLabel = !firstUnfinished ? "Complete course" : next ? "Complete and continue" : "Mark as complete";

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:p-4">
      <div className="flex min-w-0 items-center gap-2">
        <StepButton courseId={courseId} lesson={previous} direction="previous" />
        <StepButton courseId={courseId} lesson={next} direction="next" />
        <div className="min-w-0 pl-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {next ? "Up next" : firstUnfinished ? "Still to do" : "Last lesson"}
          </p>
          {next ? (
            <p className="truncate text-sm font-medium">{next.title}</p>
          ) : firstUnfinished ? (
            <Link
              href={learnHref(courseId, firstUnfinished.id)}
              className="block truncate text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {firstUnfinished.title}
            </Link>
          ) : (
            <p className="truncate text-sm font-medium">You&apos;re at the end of the course</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:ml-auto">
        {completed ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              <CircleCheck className="size-4" aria-hidden />
              Completed
            </span>
            {next && (
              <Button size="lg" className="ml-auto px-4" render={<Link href={learnHref(courseId, next.id)} />}>
                Next lesson
                <ChevronRight aria-hidden />
              </Button>
            )}
          </>
        ) : (
          <MarkCompleteButton lessonId={lessonId} watchedSeconds={watchedSeconds} label={completeLabel} />
        )}
      </div>
    </div>
  );
}
