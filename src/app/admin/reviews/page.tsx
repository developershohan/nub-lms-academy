import { listAllReviewsForAdmin } from "@/server/services/review-service";
import { requireAdmin } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReviewModerationActions } from "@/components/admin/review-moderation-actions";

export default async function AdminReviewsPage() {
  await requireAdmin();
  const reviews = await listAllReviewsForAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reviews</h1>
      {reviews.length === 0 && <p className="text-muted-foreground">No reviews yet.</p>}
      <div className="space-y-3">
        {reviews.map((review) => (
          <Card key={review.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{review.course.title}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{review.rating} stars</Badge>
                {review.hidden && <Badge variant="secondary">Hidden</Badge>}
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{review.user.name ?? review.user.email}</p>
                {review.comment && <p className="text-sm text-muted-foreground">{review.comment}</p>}
              </div>
              <ReviewModerationActions reviewId={review.id} hidden={review.hidden} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
