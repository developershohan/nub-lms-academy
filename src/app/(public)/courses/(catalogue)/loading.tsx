import { Skeleton } from "@/components/ui/skeleton";
import { CourseGridSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

// Lives in the (catalogue) group so it covers /courses only - a loading.tsx directly in courses/
// would also show this grid while a course landing page (courses/[slug]) loads.
// Mirrors page.tsx: toolbar, then the filter sidebar (lg and up) beside the results.
export default function CatalogueLoading() {
  return (
    <LoadingRegion label="Loading courses" className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
      <div className="space-y-2">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Catalogue</p>
        <p className="font-heading text-4xl font-semibold tracking-tight">All courses</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-full rounded-lg sm:max-w-md" />
        <Skeleton className="h-9 w-24 rounded-lg lg:hidden" />
        <Skeleton className="ml-auto h-9 w-40 rounded-lg" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="hidden space-y-6 lg:block">
          {[4, 4, 3, 2].map((options, i) => (
            <div key={i} className="space-y-3 border-b pb-5">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: options }, (_, j) => (
                <Skeleton key={j} className="h-4 w-4/5" />
              ))}
            </div>
          ))}
        </div>

        <div className="min-w-0 space-y-5">
          <Skeleton className="h-5 w-48" />
          <CourseGridSkeleton className="gap-5 lg:grid-cols-2 xl:grid-cols-3" />
        </div>
      </div>
    </LoadingRegion>
  );
}
