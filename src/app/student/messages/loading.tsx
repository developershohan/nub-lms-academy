import { ChatSkeleton, HeadingSkeleton, LoadingRegion } from "@/components/layout/page-skeletons";

export default function StudentMessagesLoading() {
  return (
    <LoadingRegion label="Loading messages" className="space-y-6">
      <HeadingSkeleton />
      <ChatSkeleton />
    </LoadingRegion>
  );
}
