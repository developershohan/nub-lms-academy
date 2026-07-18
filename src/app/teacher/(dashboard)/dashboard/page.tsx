import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions";
import { listTeacherCourses } from "@/server/services/course-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  PUBLISHED: "secondary",
  IN_REVIEW: "outline",
  APPROVED: "outline",
  DRAFT: "outline",
  REJECTED: "destructive",
  ARCHIVED: "outline",
};

export default async function TeacherDashboardPage() {
  const user = await getCurrentUser();
  const courses = user ? await listTeacherCourses(user.id) : [];

  const published = courses.filter((c) => c.status === "PUBLISHED").length;
  const inReview = courses.filter((c) => c.status === "IN_REVIEW" || c.status === "APPROVED").length;
  const drafts = courses.filter((c) => c.status === "DRAFT" || c.status === "REJECTED").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
        <Button render={<Link href="/teacher/courses/create" />}>Create course</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Published</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{published}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>In review</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{inReview}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Drafts</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{drafts}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent courses</CardTitle>
          <Link href="/teacher/courses" className="text-sm text-muted-foreground underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {courses.length === 0 && (
            <p className="text-muted-foreground">You haven&apos;t created any courses yet.</p>
          )}
          {courses.slice(0, 5).map((course) => (
            <div key={course.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">{course.title}</p>
                <p className="text-sm text-muted-foreground">{course.category?.name ?? "Uncategorized"}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={STATUS_VARIANT[course.status] ?? "outline"}>{course.status.replace("_", " ")}</Badge>
                <Button size="sm" variant="outline" render={<Link href={`/teacher/courses/${course.id}/edit`} />}>
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
