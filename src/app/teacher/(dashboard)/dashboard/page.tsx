import Link from "next/link";
import { ArrowRight, BookOpenCheck, DollarSign, Plus, Star, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { formatCount, formatMoney } from "@/lib/format";
import { studioHref, summariseInstructorCourses } from "@/lib/studio";
import { listInstructorCourses, listRecentReviews, type InstructorCourse } from "@/server/services/studio-service";
import { InstructorCourseRow } from "@/components/teacher/studio/instructor-course-row";
import { ReviewList } from "@/components/teacher/studio/review-list";
import { StatTile } from "@/components/teacher/studio/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Instructor dashboard" };

/** The one thing to do next on each course that needs the teacher, most urgent first. */
function attentionItems(courses: InstructorCourse[]) {
  const items: { course: InstructorCourse; title: string; detail: string }[] = [];
  for (const course of courses.filter((c) => c.status === "REJECTED")) {
    items.push({ course, title: "Changes requested", detail: course.rejectionReason ?? "An admin asked for changes." });
  }
  for (const course of courses.filter((c) => c.status === "DRAFT")) {
    const { ready, requiredDone, requiredTotal } = course.checklist;
    items.push(
      ready
        ? { course, title: "Ready to submit", detail: "Every required step is done. Submit it for review." }
        : { course, title: "Draft in progress", detail: `${requiredDone} of ${requiredTotal} required steps done.` }
    );
  }
  return items;
}

export default async function TeacherDashboardPage() {
  const user = await getCurrentUser();
  const [courses, reviews] = user
    ? await Promise.all([listInstructorCourses(user.id), listRecentReviews({ teacherId: user.id })])
    : [[], []];
  const totals = summariseInstructorCourses(courses);
  const attention = attentionItems(courses);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Instructor</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
        </div>
        <Button render={<Link href="/teacher/courses/create" />}>
          <Plus aria-hidden />
          Create course
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} label="Students" value={formatCount(totals.students)} detail="Active enrollments" />
        <StatTile icon={DollarSign} label="Sales" value={formatMoney(totals.sales)} detail="All time, after coupons" />
        <StatTile
          icon={Star}
          label="Rating"
          value={totals.ratingCount > 0 ? totals.ratingAvg.toFixed(1) : "–"}
          detail={`${formatCount(totals.ratingCount)} ${totals.ratingCount === 1 ? "review" : "reviews"}`}
        />
        <StatTile
          icon={BookOpenCheck}
          label="Live courses"
          value={formatCount(totals.published)}
          detail={`of ${formatCount(courses.length)} in total`}
        />
      </div>

      {attention.length > 0 && (
        <section aria-labelledby="attention-heading" className="space-y-3">
          <h2 id="attention-heading" className="font-heading text-lg font-semibold">
            Needs your attention
          </h2>
          <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {attention.map(({ course, title, detail }) => (
              <li key={course.id}>
                <Link
                  href={studioHref(course.id)}
                  className="flex items-center gap-3 p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {title}: <span className="font-normal">{course.title}</span>
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{detail}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="courses-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="courses-heading" className="font-heading text-lg font-semibold">
              Your courses
            </h2>
            {courses.length > 4 && (
              <Link href="/teacher/courses" className="text-sm font-medium text-primary hover:underline">
                View all {courses.length}
              </Link>
            )}
          </div>
          {courses.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              You haven&apos;t created a course yet.{" "}
              <Link href="/teacher/courses/create" className="font-medium text-primary hover:underline">
                Create your first one
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-3">
              {courses.slice(0, 4).map((course) => (
                <InstructorCourseRow key={course.id} course={course} />
              ))}
            </ul>
          )}
        </section>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Latest reviews</CardTitle>
          </CardHeader>
          <CardContent>
            {reviews.length > 0 ? (
              <ReviewList reviews={reviews} showCourse />
            ) : (
              <p className="text-sm text-muted-foreground">Reviews from your students will show up here.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
