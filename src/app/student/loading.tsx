import { Skeleton } from "@/components/ui/skeleton";
import { EnrolledCourseCardSkeleton, HeadingSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

// Fallback for every learner page without its own loading.tsx: title, section heading, course cards.
export default function StudentLoading() {
  return (
    <LoadingRegion className="space-y-6">
      <HeadingSkeleton />
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EnrolledCourseCardSkeleton />
        <EnrolledCourseCardSkeleton />
        <EnrolledCourseCardSkeleton />
      </div>
    </LoadingRegion>
  );
}
