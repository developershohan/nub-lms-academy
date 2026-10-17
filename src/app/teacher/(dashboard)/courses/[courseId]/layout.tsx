import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Eye } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { getStudioCourse } from "@/server/services/studio-service";
import { StudioNav } from "@/components/teacher/studio/studio-nav";
import { CourseStatusBadge } from "@/components/teacher/studio/course-status";
import { Button } from "@/components/ui/button";

/** The instructor studio: course header and section nav around each part of the course (see lib/studio.ts). */
export default async function CourseStudioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();
  const studio = await getStudioCourse(courseId, user.id);
  if (!studio) notFound();

  const { course, checklist } = studio;
  const unfinished = [...new Set(checklist.items.filter((i) => i.required && !i.done).map((i) => i.section))];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/teacher/courses"
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All courses
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Course studio</p>
            <h1 className="font-heading text-2xl font-semibold tracking-tight break-words sm:text-3xl">{course.title}</h1>
            <CourseStatusBadge status={course.status} />
          </div>
          <div className="flex flex-wrap gap-2">
            {course.status === "PUBLISHED" && (
              <Button variant="outline" size="sm" render={<Link href={`/courses/${course.slug}`} />}>
                <ExternalLink aria-hidden />
                Course page
              </Button>
            )}
            <Button variant="outline" size="sm" render={<Link href={`/student/course/${course.id}/learn`} />}>
              <Eye aria-hidden />
              Preview as student
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[200px_minmax(0,1fr)] xl:gap-8">
        <StudioNav courseId={course.id} unfinished={unfinished} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
