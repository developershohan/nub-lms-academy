import { Skeleton } from "@/components/ui/skeleton";
import { HeadingSkeleton, ListRowsSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

// Fallback for admin pages without their own loading.tsx: title, search/tabs bar, record cards.
export default function AdminLoading() {
  return (
    <LoadingRegion className="space-y-6">
      <HeadingSkeleton />
      <Skeleton className="h-9 w-full max-w-sm rounded-lg" />
      <ListRowsSkeleton />
    </LoadingRegion>
  );
}
