import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = { sm: "size-3.5", md: "size-4", lg: "size-5" } as const;

/** Five stars filled to `value` (fractions included), with the number spoken to screen readers. */
export function RatingStars({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} className={cn(SIZES[size], "shrink-0")} fill="currentColor" strokeWidth={0} aria-hidden />
      ))}
    </>
  );
  return (
    <span className={cn("relative inline-flex", className)} role="img" aria-label={`Rated ${value.toFixed(1)} out of 5`}>
      <span className="flex text-foreground/15">{row}</span>
      <span className="absolute inset-y-0 left-0 flex overflow-hidden text-amber" style={{ width: `${percent}%` }}>
        {row}
      </span>
    </span>
  );
}
