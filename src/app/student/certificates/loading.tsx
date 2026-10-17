import { HeadingSkeleton, ListRowsSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

export default function CertificatesLoading() {
  return (
    <LoadingRegion label="Loading your certificates" className="space-y-6">
      <HeadingSkeleton />
      <ListRowsSkeleton rows={2} />
    </LoadingRegion>
  );
}
