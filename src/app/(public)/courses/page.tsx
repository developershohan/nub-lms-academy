import { listPublishedCourses } from "@/server/services/course-service";
import { listCategories } from "@/server/services/category-service";
import { CourseCard } from "@/components/course/course-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;
  const [courses, categories] = await Promise.all([
    listPublishedCourses({ q, categorySlug: category }),
    listCategories(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Courses</h1>

      <form className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search courses..." className="max-w-xs" />
        <select
          name="category"
          defaultValue={category ?? ""}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {courses.length === 0 && <p className="text-muted-foreground">No courses found.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={course.slug} course={course} />
        ))}
      </div>
    </div>
  );
}
