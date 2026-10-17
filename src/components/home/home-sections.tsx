import Link from "next/link";
import { ArrowRight, PlayCircle, Star, Users } from "lucide-react";
import { CourseCard } from "@/components/course/course-card";
import { categoryStyle } from "@/lib/category-style";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HomeCourse, TopInstructor } from "@/server/services/home-service";

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">{children}</p>;
}

function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel,
  id,
}: {
  eyebrow: string;
  title: React.ReactNode;
  href?: string;
  linkLabel?: string;
  id: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={id} className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {linkLabel ?? "View all"}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** A heading and a row of course cards - every course list on the home page. */
export function CourseRail({
  id,
  eyebrow,
  title,
  href,
  linkLabel,
  courses,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  href?: string;
  linkLabel?: string;
  courses: HomeCourse[];
}) {
  if (courses.length === 0) return null;
  return (
    <section aria-labelledby={id} className="space-y-6">
      <SectionHeading id={id} eyebrow={eyebrow} title={title} href={href} linkLabel={linkLabel} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </section>
  );
}

type ContinueItem = {
  course: HomeCourse;
  percent: number;
  lastLesson: { id: string; title: string } | null;
};

/** The student's unfinished courses: where they stopped, how far along they are, one click back in. */
export function ContinueLearning({ items }: { items: ContinueItem[] }) {
  return (
    <section aria-labelledby="continue-heading" className="space-y-6">
      <SectionHeading id="continue-heading" eyebrow="Pick up where you left off" title="Continue learning" href="/student/my-courses" linkLabel="All my courses" />
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map(({ course, percent, lastLesson }) => {
          const spine = course.category ? categoryStyle(course.category) : null;
          return (
            <li key={course.id}>
              <Link
                href={`/student/course/${course.id}/learn`}
                className="group flex h-full gap-4 rounded-xl bg-card p-3 ring-1 ring-foreground/10 outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className={cn("relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg", spine?.tint ?? "bg-muted")}>
                  {course.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={course.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className={cn("absolute inset-y-0 left-0 w-1", spine?.bar ?? "bg-border")} aria-hidden />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                    <PlayCircle className="size-7 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" aria-hidden />
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{course.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lastLesson ? `Resume: ${lastLesson.title}` : "Start the first lesson"}
                  </p>
                  <div className="mt-auto flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{percent}%</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function initials(name: string | null) {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Instructors with the most students. No profile pages yet, so a card opens their courses in the catalogue. */
export function TopInstructors({ instructors }: { instructors: TopInstructor[] }) {
  if (instructors.length === 0) return null;
  return (
    <section aria-labelledby="instructors-heading" className="space-y-6">
      <SectionHeading id="instructors-heading" eyebrow="Learn from the best" title="Top instructors" />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {instructors.map((teacher) => (
          <li key={teacher.id}>
            <Link
              href={`/courses?q=${encodeURIComponent(teacher.name ?? "")}`}
              className="flex h-full flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex items-center gap-3">
                {teacher.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={teacher.image} alt="" className="size-12 rounded-full object-cover" />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 font-heading text-lg font-semibold text-primary" aria-hidden>
                    {initials(teacher.name)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-heading font-semibold">{teacher.name ?? "Instructor"}</p>
                  {teacher.headline && <p className="line-clamp-2 text-xs text-muted-foreground">{teacher.headline}</p>}
                </div>
              </div>
              <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="size-3.5" aria-hidden />
                  <dt className="sr-only">Students</dt>
                  <dd>{formatCount(teacher.students)} students</dd>
                </div>
                <div>
                  <dt className="sr-only">Courses</dt>
                  <dd>
                    {teacher.courses} {teacher.courses === 1 ? "course" : "courses"}
                  </dd>
                </div>
                {teacher.ratingCount > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="size-3.5 fill-amber text-amber" aria-hidden />
                    <dt className="sr-only">Rating</dt>
                    <dd>{teacher.ratingAvg.toFixed(1)}</dd>
                  </div>
                )}
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
