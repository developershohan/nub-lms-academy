import { RatingStars } from "@/components/course/rating-stars";
import { formatRelativeDate } from "@/lib/format";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  user: { name: string | null };
  course: { id: string; title: string };
};

/** Latest student reviews; `showCourse` names the course when the list spans several. */
export function ReviewList({ reviews, showCourse = false }: { reviews: Review[]; showCourse?: boolean }) {
  return (
    <ul className="divide-y">
      {reviews.map((review) => (
        <li key={review.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <RatingStars value={review.rating} />
            <span className="font-medium">{review.user.name ?? "A student"}</span>
            <span className="text-xs text-muted-foreground">{formatRelativeDate(review.createdAt)}</span>
          </div>
          {review.comment && <p className="line-clamp-3 text-sm text-muted-foreground">{review.comment}</p>}
          {showCourse && <p className="truncate text-xs text-muted-foreground">on {review.course.title}</p>}
        </li>
      ))}
    </ul>
  );
}
