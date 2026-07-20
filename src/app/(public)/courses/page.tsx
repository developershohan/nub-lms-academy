import Link from "next/link";
import { listPublishedCourses } from "@/server/services/course-service";
import { listCategories } from "@/server/services/category-service";
import { CourseCard } from "@/components/course/course-card";
import { CourseFilters } from "@/components/course/course-filters";

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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:py-24">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Catalogue</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">All courses</h1>
      </div>

      <CourseFilters categories={categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name }))} />

      {courses.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No courses match this search.</p>
          <Link href="/courses" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
            Clear filters
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={course.slug} course={course} />
        ))}
      </div>
    </div>
  );
}
