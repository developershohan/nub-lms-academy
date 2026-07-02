import { listCoursesForAdmin } from "@/server/services/course-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CourseReviewActions } from "@/components/admin/course-review-actions";

export default async function AdminCoursesPage() {
  const courses = await listCoursesForAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Courses</h1>
      {courses.length === 0 && <p className="text-muted-foreground">No courses yet.</p>}
      <div className="space-y-3">
        {courses.map((course) => (
          <Card key={course.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{course.title}</CardTitle>
              <Badge variant="secondary">{course.status.replace("_", " ")}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {course.teacher.name ?? course.teacher.email} · {course.category?.name ?? "Uncategorized"}
              </span>
              <CourseReviewActions courseId={course.id} status={course.status} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
