import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { categoryStyle } from "@/lib/category-style";
import { cn } from "@/lib/utils";

/**
 * Catalogue card with the category "spine" treatment (docs/DESIGN.md §3.2):
 * colored spine bar on the left, mono classification sticker on the thumbnail.
 */
export function CourseCard({
  course,
}: {
  course: {
    slug: string;
    title: string;
    subtitle: string | null;
    thumbnailUrl?: string | null;
    price: unknown;
    salePrice: unknown;
    level: string;
    category: { name: string; slug: string } | null;
    teacher: { name: string | null };
  };
}) {
  const price = Number(course.price);
  const salePrice = course.salePrice != null ? Number(course.salePrice) : null;
  const spine = course.category ? categoryStyle(course.category) : null;

  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <article className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-all duration-200 motion-safe:group-hover:-translate-y-0.5 group-hover:border-foreground/20 group-hover:shadow-md">
        <span className={cn("absolute inset-y-0 left-0 w-1", spine?.bar ?? "bg-border")} aria-hidden />
        <div className={cn("relative aspect-video w-full overflow-hidden", spine?.tint ?? "bg-muted")}>
          {course.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-end p-4">
              <span className={cn("font-heading text-2xl font-semibold leading-tight opacity-80", spine?.onTint)}>
                {course.title.slice(0, 40)}
              </span>
            </div>
          )}
          {spine && (
            <span
              className={cn(
                "absolute left-3 top-3 rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-widest",
                spine.bar,
                spine.onBar
              )}
            >
              {spine.code}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4 pl-5">
          <div className="flex items-center gap-2">
            {course.category && <Badge variant="secondary">{course.category.name}</Badge>}
            <Badge variant="outline">{course.level.replace(/_/g, " ")}</Badge>
          </div>
          <h3 className="line-clamp-2 font-heading text-base font-semibold leading-snug">
            {course.title}
          </h3>
          {course.subtitle && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{course.subtitle}</p>
          )}
          <div className="mt-auto flex items-center justify-between pt-2 text-sm">
            <span className="text-muted-foreground">{course.teacher.name ?? "Unknown instructor"}</span>
            <span className="font-mono font-medium">
              {salePrice != null ? (
                <>
                  <span className="mr-1.5 text-muted-foreground line-through">${price.toFixed(2)}</span>
                  ${salePrice.toFixed(2)}
                </>
              ) : price === 0 ? (
                "Free"
              ) : (
                `$${price.toFixed(2)}`
              )}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
