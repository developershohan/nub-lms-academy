import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getStudioCourse } from "@/server/services/studio-service";
import { GoalsForm } from "@/components/teacher/studio/goals-form";
import { StudioSectionHeader } from "@/components/teacher/studio/section-header";

export const metadata = { title: "Intended learners" };

export default async function CourseGoalsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  const studio = user ? await getStudioCourse(courseId, user.id) : null;
  if (!studio) notFound();
  const { course } = studio;

  return (
    <div className="space-y-6">
      <StudioSectionHeader
        title="Intended learners"
        description="Set expectations: what students will learn, what they need, and who the course is for."
      />
      <GoalsForm
        courseId={course.id}
        outcomes={course.outcomes.map((o) => o.content)}
        requirements={course.requirements.map((r) => r.content)}
        targetAudience={course.targetAudience}
      />
    </div>
  );
}
