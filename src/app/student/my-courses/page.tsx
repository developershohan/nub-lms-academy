import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions";
import { listStudentEnrollments } from "@/server/services/enrollment-service";
import { getCourseProgress } from "@/server/services/progress-service";
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
      {enrollments.length === 0 && (
        <p className="text-muted-foreground">
          You haven&apos;t enrolled in any courses yet.{" "}
          <Link href="/courses" className="underline">
            Browse courses
          </Link>
          .
        </p>
      )}
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
    </div>
  );
}
