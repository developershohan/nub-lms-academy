import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listTeacherCourses } from "@/server/services/course-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TeacherCoursesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const courses = await listTeacherCourses(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your courses</h1>
        <Button render={<Link href="/teacher/courses/create" />}>Create course</Button>
      </div>

      {courses.length === 0 && <p className="text-muted-foreground">You haven&apos;t created any courses yet.</p>}

      <div className="space-y-3">
        {courses.map((course) => (
          <Card key={course.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{course.title}</CardTitle>
              <Badge variant="secondary">{course.status.replace("_", " ")}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{course.category?.name ?? "Uncategorized"}</span>
              <Button size="sm" variant="outline" render={<Link href={`/teacher/courses/${course.id}/edit`} />}>
                Edit
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
