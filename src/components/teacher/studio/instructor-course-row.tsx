import Link from "next/link";
import { Star, Users } from "lucide-react";
import { categoryStyle } from "@/lib/category-style";
import { formatCount, formatMoney, formatTotalDuration } from "@/lib/format";
import { studioHref } from "@/lib/studio";
import { cn } from "@/lib/utils";
import type { InstructorCourse } from "@/server/services/studio-service";
import { CourseStatusBadge } from "@/components/teacher/studio/course-status";
import { Button } from "@/components/ui/button";

/** A small 16:9 tile: the course image, or the category spine colours and code like the catalogue card. */
function Thumb({ course }: { course: InstructorCourse }) {
  const spine = course.category ? categoryStyle(course.category) : null;
  return (
    <div
      className={cn(
        "relative aspect-video w-24 shrink-0 overflow-hidden rounded-md sm:w-32",
        spine?.tint ?? "bg-muted"
      )}
      aria-hidden
    >
      {course.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={course.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <>
          <span className={cn("absolute inset-y-0 left-0 w-1", spine?.bar ?? "bg-border")} />
          {spine && (
            <span className={cn("absolute left-2.5 top-2 font-mono text-[11px] font-medium tracking-widest", spine.onTint)}>
              {spine.code}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** One course on the teacher's dashboard and course list: status, size, and how it is doing. */
export function InstructorCourseRow({ course }: { course: InstructorCourse }) {
  const unfinished = course.status === "DRAFT" || course.status === "REJECTED";
  const live = course.status === "PUBLISHED" || course.students > 0;
  const { requiredDone, requiredTotal } = course.checklist;

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:p-4">
      <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
        <Thumb course={course} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={studioHref(course.id)}
              className="min-w-0 truncate font-heading font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {course.title}
            </Link>
            <CourseStatusBadge status={course.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {course.category?.name ?? "No category"} · {course.lessonCount}{" "}
            {course.lessonCount === 1 ? "lesson" : "lessons"}
            {course.totalDurationSec > 0 && ` · ${formatTotalDuration(course.totalDurationSec)}`}
          </p>
          {unfinished && (
            <div className="flex max-w-xs items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((requiredDone / requiredTotal) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {course.checklist.ready ? "Ready to submit" : `${requiredDone}/${requiredTotal} steps`}
              </span>
            </div>
          )}
          {live && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {formatCount(course.students)} {course.students === 1 ? "student" : "students"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5" aria-hidden />
                {course.ratingCount > 0 ? `${course.ratingAvg.toFixed(1)} (${formatCount(course.ratingCount)})` : "No ratings yet"}
              </span>
              <span>{formatMoney(course.sales)} sales</span>
            </p>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" className="self-start sm:self-center" render={<Link href={studioHref(course.id)} />}>
        Open studio<span className="sr-only">: {course.title}</span>
      </Button>
    </li>
  );
}
