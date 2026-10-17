import { HeadingSkeleton, LoadingRegion, StatCardsSkeleton } from "@/components/layout/page-skeletons";

export default function AdminDashboardLoading() {
  return (
    <LoadingRegion label="Loading the admin overview" className="space-y-6">
      <HeadingSkeleton />
      <StatCardsSkeleton count={2} />
    </LoadingRegion>
  );
}
