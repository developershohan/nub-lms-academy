import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { listPublishedCourses } from "@/server/services/course-service";
import { CourseCard } from "@/components/course/course-card";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();

  const courses = await listPublishedCourses({ categorySlug: slug });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">{category.name}</h1>
      {courses.length === 0 && <p className="text-muted-foreground">No courses in this category yet.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={course.slug} course={course} />
        ))}
      </div>
    </div>
  );
}
