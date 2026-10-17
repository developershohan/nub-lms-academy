import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { listStudentEnrollments } from "@/server/services/enrollment-service";
import { getCourseProgress } from "@/server/services/progress-service";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EnrolledCourseCard } from "@/components/student/enrolled-course-card";

export default async function MyCoursesPage() {
  const user = await getCurrentUser();
  const enrollments = user ? await listStudentEnrollments(user.id) : [];
  const progressByCourse = await Promise.all(
    enrollments.map((e) => getCourseProgress(user!.id, e.courseId))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My courses</h1>
      {enrollments.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Courses you enroll in live here. Your progress is saved lesson by lesson, on any device."
        >
          <Button size="lg" render={<Link href="/courses" />}>
            Browse courses
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/student/wishlist" />}>
            Open your wishlist
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((enrollment, i) => (
            <EnrolledCourseCard
              key={enrollment.id}
              courseId={enrollment.courseId}
              title={enrollment.course.title}
              categoryName={enrollment.course.category?.name}
              percent={progressByCourse[i].percent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
