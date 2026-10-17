export type RatingSummary = {
  average: number;
  count: number;
  /** Share of reviews at each star level, 5 down to 1, as whole percentages. */
  breakdown: { stars: 5 | 4 | 3 | 2 | 1; count: number; percent: number }[];
};

/** Turns a groupBy over CourseReview.rating into the average, total and 5-to-1 histogram the
 * course page shows. Ratings outside 1-5 are ignored. */
export function summarizeRatings(groups: { rating: number; count: number }[]): RatingSummary {
  const counts = new Map<number, number>();
  for (const { rating, count } of groups) {
    if (rating >= 1 && rating <= 5) counts.set(rating, (counts.get(rating) ?? 0) + count);
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const weighted = [...counts.entries()].reduce((sum, [rating, n]) => sum + rating * n, 0);

  const levels = ([5, 4, 3, 2, 1] as const).map((stars) => {
    const count = counts.get(stars) ?? 0;
    const exact = total ? (count / total) * 100 : 0;
    return { stars, count, percent: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  // Largest-remainder rounding, so the bars always add up to exactly 100% (plain rounding can
  // show 63 + 25 + 13 = 101).
  let missing = total ? 100 - levels.reduce((sum, level) => sum + level.percent, 0) : 0;
  for (const level of [...levels].sort((a, b) => b.remainder - a.remainder)) {
    if (missing <= 0) break;
    level.percent += 1;
    missing -= 1;
  }

  return {
    average: total ? Math.round((weighted / total) * 10) / 10 : 0,
    count: total,
    breakdown: levels.map(({ stars, count, percent }) => ({ stars, count, percent })),
  };
}
