import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getCourseForEdit } from "@/server/services/course-service";
import { listCategories } from "@/server/services/category-service";
import { listQuizzesForEdit } from "@/server/services/quiz-service";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseDetailsForm } from "@/components/teacher/course-details-form";
import { CurriculumBuilder } from "@/components/teacher/curriculum-builder";
import { QuizManager } from "@/components/teacher/quiz-manager";
import { SubmitReviewButton } from "@/components/teacher/submit-review-button";

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const [course, categories] = await Promise.all([getCourseForEdit(courseId, user.id), listCategories()]);
  if (!course) notFound();

  const quizzes = (await listQuizzesForEdit(user.id, courseId)) ?? [];

  const canSubmit = course.status === "DRAFT" || course.status === "REJECTED";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{course.title}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{course.status.replace("_", " ")}</Badge>
            {course.status === "REJECTED" && course.rejectionReason && (
              <span className="text-sm text-destructive">Reason: {course.rejectionReason}</span>
            )}
          </div>
        </div>
        {canSubmit && <SubmitReviewButton courseId={course.id} />}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
          <TabsTrigger value="quizzes">Quizzes</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <CourseDetailsForm
            key={course.updatedAt.getTime()}
            courseId={course.id}
            categories={categories}
            course={{
              title: course.title,
              subtitle: course.subtitle,
              description: course.description,
              categoryId: course.categoryId,
              level: course.level,
              language: course.language,
              price: Number(course.price),
              salePrice: course.salePrice != null ? Number(course.salePrice) : null,
              targetAudience: course.targetAudience,
              requirements: course.requirements,
              outcomes: course.outcomes,
            }}
          />
        </TabsContent>
        <TabsContent value="curriculum" className="pt-4">
          <CurriculumBuilder courseId={course.id} sections={course.sections} />
        </TabsContent>
        <TabsContent value="quizzes" className="pt-4">
          <QuizManager courseId={course.id} quizzes={quizzes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
