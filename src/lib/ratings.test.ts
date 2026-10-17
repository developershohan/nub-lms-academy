import { describe, expect, it } from "vitest";
import { summarizeRatings } from "./ratings";

describe("summarizeRatings", () => {
  it("computes the average and a 5-to-1 histogram that always adds up to 100%", () => {
    // 5 five-star, 2 four-star, 1 three-star: plain rounding would show 63 + 25 + 13 = 101%.
    const summary = summarizeRatings([
      { rating: 5, count: 5 },
      { rating: 4, count: 2 },
      { rating: 3, count: 1 },
    ]);

    expect(summary.average).toBe(4.5);
    expect(summary.count).toBe(8);
    expect(summary.breakdown.map((b) => b.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(summary.breakdown.reduce((sum, b) => sum + b.percent, 0)).toBe(100);
    expect(summary.breakdown[3]).toEqual({ stars: 2, count: 0, percent: 0 });
  });

  it("returns zeros, not NaN, when there are no reviews", () => {
    const summary = summarizeRatings([]);
    expect(summary.average).toBe(0);
    expect(summary.count).toBe(0);
    expect(summary.breakdown.every((b) => b.percent === 0)).toBe(true);
  });

  it("ignores out-of-range ratings", () => {
    expect(summarizeRatings([{ rating: 9, count: 3 }, { rating: 4, count: 1 }]).count).toBe(1);
  });
});
