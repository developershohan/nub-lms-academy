import { Skeleton } from "@/components/ui/skeleton";
import { CourseGridSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

// Lives in the (catalogue) group so it covers /courses only - a loading.tsx directly in courses/
// would also show this grid while a course landing page (courses/[slug]) loads.
export default function CatalogueLoading() {
  return (
    <LoadingRegion label="Loading courses" className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:py-24">
      <div>
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Catalogue</p>
        <p className="mt-2 font-heading text-4xl font-semibold tracking-tight">All courses</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <CourseGridSkeleton />
    </LoadingRegion>
  );
}
