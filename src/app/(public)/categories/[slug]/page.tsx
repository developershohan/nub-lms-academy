import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { listPublishedCourses } from "@/server/services/course-service";
import { CourseCard } from "@/components/course/course-card";
import { categoryStyle } from "@/lib/category-style";
import { cn } from "@/lib/utils";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();

  const courses = await listPublishedCourses({ categorySlug: slug });
  const spine = categoryStyle(category);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <Link
        href="/categories"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All categories
      </Link>
      <div className="mt-5 flex items-center gap-3">
        <span
          className={cn(
            "rounded-sm px-2 py-1 font-mono text-sm font-medium tracking-widest",
            spine.bar,
            spine.onBar
          )}
        >
          {spine.code}
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">{category.name}</h1>
      </div>
      <p className="mt-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {courses.length} {courses.length === 1 ? "course" : "courses"} on this shelf
      </p>

      {courses.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No courses in this category yet.</p>
          <Link href="/courses" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
            Browse all courses
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.slug} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
