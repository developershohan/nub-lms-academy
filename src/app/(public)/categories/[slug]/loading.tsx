import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseGridSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

export default function CategoryLoading() {
  return (
    <LoadingRegion label="Loading courses" className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="size-3.5" />
        All categories
      </p>
      <div className="mt-5 flex items-center gap-3">
        <Skeleton className="h-7 w-11 rounded-sm" />
        <Skeleton className="h-10 w-64 max-w-[70%]" />
      </div>
      <Skeleton className="mt-3 h-3 w-36" />
      <div className="mt-10">
        <CourseGridSkeleton />
      </div>
    </LoadingRegion>
  );
}
