import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { formatTotalDuration } from "@/lib/format";
import { getStudioCourse } from "@/server/services/studio-service";
import { CurriculumBuilder } from "@/components/teacher/curriculum-builder";
import { StudioSectionHeader } from "@/components/teacher/studio/section-header";

export const metadata = { title: "Curriculum" };

export default async function CourseCurriculumPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  const studio = user ? await getStudioCourse(courseId, user.id) : null;
  if (!studio) notFound();

  const { course } = studio;
  const lessons = course.sections.flatMap((s) => s.lessons);
  const length = lessons.reduce((sum, l) => sum + (l.durationSec ?? 0), 0);

  return (
    <div className="space-y-6">
      <StudioSectionHeader
        title="Curriculum"
        description="Sections and lessons in the order students take them. Use the arrows to reorder."
      >
        <p className="font-mono text-xs text-muted-foreground">
          {course.sections.length} {course.sections.length === 1 ? "section" : "sections"} · {lessons.length}{" "}
          {lessons.length === 1 ? "lesson" : "lessons"}
          {length > 0 && ` · ${formatTotalDuration(length)}`}
        </p>
      </StudioSectionHeader>
      <CurriculumBuilder courseId={course.id} sections={course.sections} />
    </div>
  );
}
