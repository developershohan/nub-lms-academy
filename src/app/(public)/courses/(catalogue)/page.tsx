import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX, X } from "lucide-react";
import { searchCatalog } from "@/server/services/catalog-service";
import { CourseCard } from "@/components/course/course-card";
import { CatalogFilters } from "@/components/course/catalog-filters";
import { CatalogFilterDrawer, CatalogSort } from "@/components/course/catalog-toolbar";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { CATALOG_PAGE_SIZE, DURATIONS, catalogHref, pageWindow, parseCatalogParams } from "@/lib/catalog";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const { q } = parseCatalogParams(await searchParams);
  return {
    title: q ? `Courses matching "${q}"` : "All courses",
    description: "Browse NUB Academy courses by topic, level, price, rating and length.",
    alternates: { canonical: "/courses" },
  };
}

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export default async function CoursesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const params = parseCatalogParams(raw);
  const { courses, total, page, pageCount, facets } = await searchCatalog(params);

  // One removable chip per active filter value.
  const categoryNames = new Map(facets.categories.map((c) => [c.value, c.label]));
  const chips = [
    ...(params.minRating != null ? [{ label: `${params.minRating.toFixed(1)}+ rating`, href: catalogHref(raw, { rating: null }) }] : []),
    ...params.durations.map((d) => ({
      label: DURATIONS[d].label,
      href: catalogHref(raw, { duration: params.durations.filter((x) => x !== d) }),
    })),
    ...params.levels.map((l) => ({
      label: LEVEL_LABELS[l],
      href: catalogHref(raw, { level: params.levels.filter((x) => x !== l) }),
    })),
    ...params.prices.map((p) => ({
      label: p === "free" ? "Free" : "Paid",
      href: catalogHref(raw, { price: params.prices.filter((x) => x !== p) }),
    })),
    ...params.categories.map((c) => ({
      label: categoryNames.get(c) ?? c,
      href: catalogHref(raw, { category: params.categories.filter((x) => x !== c) }),
    })),
    ...params.languages.map((l) => ({
      label: l,
      href: catalogHref(raw, { language: params.languages.filter((x) => x !== l) }),
    })),
  ];
  const clearAll = params.q ? `/courses?q=${encodeURIComponent(params.q)}` : "/courses";
  const firstShown = total === 0 ? 0 : (page - 1) * CATALOG_PAGE_SIZE + 1;
  const lastShown = Math.min(page * CATALOG_PAGE_SIZE, total);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Catalogue</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight">
          {params.q ? <>Results for &ldquo;{params.q}&rdquo;</> : "All courses"}
        </h1>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search courses, topics or instructors" className="w-full sm:max-w-md" />
        <CatalogFilterDrawer facets={facets} params={params} activeCount={chips.length} />
        <div className="ml-auto">
          <CatalogSort value={params.sort} />
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Filters">
          <CatalogFilters facets={facets} params={params} />
        </aside>

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-sm text-muted-foreground" aria-live="polite">
              {total === 0
                ? "No results"
                : `Showing ${firstShown}-${lastShown} of ${total} ${total === 1 ? "course" : "courses"}`}
            </p>
            {chips.map((chip) => (
              <Link
                key={chip.label}
                href={chip.href}
                scroll={false}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium hover:bg-muted"
                aria-label={`Remove filter: ${chip.label}`}
              >
                {chip.label}
                <X className="size-3" aria-hidden />
              </Link>
            ))}
            {chips.length > 1 && (
              <Link href={clearAll} scroll={false} className="text-xs font-medium text-primary hover:underline">
                Clear all
              </Link>
            )}
          </div>

          {courses.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
              <SearchX className="size-10 text-muted-foreground" aria-hidden />
              <p className="font-heading text-lg font-semibold">No courses match</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Try fewer filters, a broader search term, or browse every course.
              </p>
              <Button variant="outline" render={<Link href="/courses" />}>
                Browse all courses
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}

          {pageCount > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-1 pt-4">
              <PageLink href={catalogHref(raw, { page: String(page - 1) })} disabled={page === 1} label="Previous page">
                <ChevronLeft className="size-4" aria-hidden />
              </PageLink>
              {pageWindow(page, pageCount).map((p, i) =>
                p == null ? (
                  <span key={`gap-${i}`} className="px-2 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <PageLink key={p} href={catalogHref(raw, { page: String(p) })} current={p === page} label={`Page ${p}`}>
                    {p}
                  </PageLink>
                )
              )}
              <PageLink
                href={catalogHref(raw, { page: String(page + 1) })}
                disabled={page === pageCount}
                label="Next page"
              >
                <ChevronRight className="size-4" aria-hidden />
              </PageLink>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

function PageLink({
  href,
  current,
  disabled,
  label,
  children,
}: {
  href: string;
  current?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(
    "inline-flex size-9 items-center justify-center rounded-md border text-sm font-medium",
    current ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
    disabled && "pointer-events-none opacity-40"
  );
  if (disabled) {
    return (
      <span className={className} aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className} aria-label={label} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
