import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/layout/page-skeletons";

// Inside the studio layout, so the course header and section nav stay put while a section loads.
export default function StudioSectionLoading() {
  return (
    <LoadingRegion label="Loading" className="space-y-6">
      <div className="space-y-2 border-b pb-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="max-w-2xl space-y-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
    </LoadingRegion>
  );
}
