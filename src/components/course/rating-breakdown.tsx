import { RatingStars } from "@/components/course/rating-stars";
import { formatCount } from "@/lib/format";
import type { RatingSummary } from "@/lib/ratings";

/** Average rating beside a 5-to-1 star histogram. */
export function RatingBreakdown({ rating }: { rating: RatingSummary }) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="flex shrink-0 flex-col items-center gap-1 sm:w-36">
        <span className="font-heading text-5xl font-semibold text-amber-foreground dark:text-amber">
          {rating.average.toFixed(1)}
        </span>
        <RatingStars value={rating.average} size="md" />
        <span className="text-xs text-muted-foreground">
          {formatCount(rating.count)} {rating.count === 1 ? "rating" : "ratings"}
        </span>
      </div>
      <ul className="flex-1 space-y-1.5" aria-label="Rating distribution">
        {rating.breakdown.map(({ stars, count, percent }) => (
          <li key={stars} className="flex items-center gap-3 text-sm">
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-amber" style={{ width: `${percent}%` }} />
            </span>
            <RatingStars value={stars} />
            <span className="w-10 text-right font-mono text-xs text-muted-foreground" title={`${count} ratings`}>
              {percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
