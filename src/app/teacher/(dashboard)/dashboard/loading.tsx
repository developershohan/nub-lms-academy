import {
  HeadingSkeleton,
  ListRowsSkeleton,
  LoadingRegion,
  StatCardsSkeleton,
} from "@/components/layout/page-skeletons";

export default function TeacherDashboardLoading() {
  return (
    <LoadingRegion label="Loading your dashboard" className="space-y-6">
      <HeadingSkeleton action />
      <StatCardsSkeleton count={3} />
      <ListRowsSkeleton rows={3} />
    </LoadingRegion>
  );
}
