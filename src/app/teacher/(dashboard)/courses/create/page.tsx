import { requireTeacher } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateCourseForm } from "@/components/teacher/create-course-form";

export default async function CreateCoursePage() {
  await requireTeacher();
  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle>Create a course</CardTitle>
          <CardDescription>Start with a title - you can fill in the rest next.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCourseForm />
        </CardContent>
      </Card>
    </div>
  );
}
