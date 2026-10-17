import Link from "next/link";
import { Heart } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { listWishlist } from "@/server/services/wishlist-service";
import { CourseCard } from "@/components/course/course-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function WishlistPage() {
  const user = await getCurrentUser();
  const items = user ? await listWishlist(user.id) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Wishlist</h1>
      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Found a course you'd like to take later? Tap “Add to wishlist” on its page and it will wait for you here."
        >
          <Button size="lg" render={<Link href="/courses" />}>
            Browse courses
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <CourseCard key={item.id} course={item.course} />
          ))}
        </div>
      )}
    </div>
  );
}
