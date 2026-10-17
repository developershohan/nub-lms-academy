import { CourseGridSkeleton, HeadingSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

export default function WishlistLoading() {
  return (
    <LoadingRegion label="Loading your wishlist" className="space-y-6">
      <HeadingSkeleton />
      <CourseGridSkeleton count={3} />
    </LoadingRegion>
  );
}
