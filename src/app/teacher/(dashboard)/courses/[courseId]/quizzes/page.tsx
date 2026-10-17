import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listQuizzesForEdit } from "@/server/services/quiz-service";
import { QuizManager } from "@/components/teacher/quiz-manager";
import { StudioSectionHeader } from "@/components/teacher/studio/section-header";

export const metadata = { title: "Quizzes" };

export default async function CourseQuizzesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  // listQuizzesForEdit returns null unless the user owns the course.
  const quizzes = user ? await listQuizzesForEdit(user.id, courseId) : null;
  if (!quizzes) notFound();

  return (
    <div className="space-y-6">
      <StudioSectionHeader
        title="Quizzes"
        description="Check understanding along the way. Students see their score and the passing mark."
      />
      <QuizManager courseId={courseId} quizzes={quizzes} />
    </div>
  );
}
