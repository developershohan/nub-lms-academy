import { getCurrentUser } from "@/lib/permissions";
import { listWishlist } from "@/server/services/wishlist-service";
import { CourseCard } from "@/components/course/course-card";

export default async function WishlistPage() {
  const user = await getCurrentUser();
  const items = user ? await listWishlist(user.id) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Wishlist</h1>
      {items.length === 0 && <p className="text-muted-foreground">Your wishlist is empty.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <CourseCard key={item.id} course={item.course} />
        ))}
      </div>
    </div>
  );
}
