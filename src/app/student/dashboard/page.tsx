import Link from "next/link";
import { Compass } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { listStudentEnrollments } from "@/server/services/enrollment-service";
import { getCourseProgress } from "@/server/services/progress-service";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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

      {recent.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="Start your first course"
          description="Pick a course from the catalogue. It will show up here with your progress, so you can carry on where you left off."
        >
          <Button size="lg" render={<Link href="/courses" />}>
            Browse courses
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/categories" />}>
            Explore categories
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Continue learning</h2>
            {enrollments.length > 3 && (
              <Link href="/student/my-courses" className="text-sm underline">
                View all
              </Link>
            )}
          </div>
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
        </>
      )}
    </div>
  );
}
