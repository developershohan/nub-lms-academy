import { HeadingSkeleton, ListRowsSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

// Fallback for teacher pages without their own loading.tsx: title + "Create course", then a list.
export default function TeacherLoading() {
  return (
    <LoadingRegion className="space-y-6">
      <HeadingSkeleton action />
      <ListRowsSkeleton />
    </LoadingRegion>
  );
}
