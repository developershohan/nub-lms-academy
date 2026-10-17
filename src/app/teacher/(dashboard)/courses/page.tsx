import Link from "next/link";
import { redirect } from "next/navigation";
import { BookPlus, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { listInstructorCourses } from "@/server/services/studio-service";
import { InstructorCourseRow } from "@/components/teacher/studio/instructor-course-row";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Your courses" };

export default async function TeacherCoursesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const courses = await listInstructorCourses(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Instructor</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Your courses</h1>
        </div>
        <Button render={<Link href="/teacher/courses/create" />}>
          <Plus aria-hidden />
          Create course
        </Button>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={BookPlus}
          title="Create your first course"
          description="Start with a title. The studio then walks you through the landing page, curriculum and pricing before you submit it for review."
        >
          <Button size="lg" render={<Link href="/teacher/courses/create" />}>
            Create course
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {courses.map((course) => (
            <InstructorCourseRow key={course.id} course={course} />
          ))}
        </ul>
      )}
    </div>
  );
}
