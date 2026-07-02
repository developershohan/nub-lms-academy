import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions";
import { listStudentEnrollments } from "@/server/services/enrollment-service";
import { getCourseProgress } from "@/server/services/progress-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnrolledCourseCard } from "@/components/student/enrolled-course-card";

export default async function StudentDashboardPage() {
  const user = await getCurrentUser();
  const enrollments = user ? await listStudentEnrollments(user.id) : [];
  const recent = enrollments.slice(0, 3);
  const progressByCourse = await Promise.all(
    recent.map((e) => getCourseProgress(user!.id, e.courseId))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Continue learning</h2>
        {enrollments.length > 3 && (
          <Link href="/student/my-courses" className="text-sm underline">
            View all
          </Link>
        )}
      </div>

      {recent.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>My courses</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            You haven&apos;t enrolled in any courses yet.{" "}
            <Link href="/courses" className="underline">
              Browse courses
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((enrollment, i) => (
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
