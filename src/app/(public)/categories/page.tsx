import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { listCategoriesWithCounts } from "@/server/services/category-service";
import { categoryStyle } from "@/lib/category-style";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Categories — NUB Academy",
  description: "Browse every course category in the NUB Academy catalogue.",
};

export default async function CategoriesPage() {
  const categories = await listCategoriesWithCounts();
  const totalCourses = categories.reduce((sum, c) => sum + c._count.courses, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Catalogue</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Browse by category</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        {totalCourses} published {totalCourses === 1 ? "course" : "courses"} across{" "}
        {categories.length} {categories.length === 1 ? "shelf" : "shelves"}. Every category has its
        own classification code — follow the colored spines.
      </p>

      {categories.length === 0 ? (
        <p className="mt-10 text-muted-foreground">
          No categories yet. Courses appear here as soon as an admin creates categories and teachers
          publish into them.
        </p>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const spine = categoryStyle(category);
            return (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group relative overflow-hidden rounded-xl border bg-card p-6 pl-7 transition-all duration-200 hover:border-foreground/20 hover:shadow-md motion-safe:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className={cn("absolute inset-y-0 left-0 w-1", spine.bar)} aria-hidden />
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-widest",
                      spine.bar,
                      spine.onBar
                    )}
                  >
                    {spine.code}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <h2 className="mt-5 font-heading text-xl font-semibold">{category.name}</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {category._count.courses} {category._count.courses === 1 ? "course" : "courses"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
