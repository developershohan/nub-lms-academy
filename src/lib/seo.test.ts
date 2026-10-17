import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absoluteUrl, courseJsonLd, jsonLdScript, metaDescription } from "./seo";

const course = {
  slug: "web-basics",
  title: "Web Basics",
  description: "Learn the web.",
  language: "English",
  imageUrl: "/covers/web-basics.png",
  price: 29.99,
  instructorName: "Naima Islam",
  totalDurationSec: 2 * 3600 + 30 * 60,
  rating: { average: 4.6, count: 12 },
};

let previousUrl: string | undefined;
beforeEach(() => {
  previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://academy.example/";
});
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = previousUrl;
});

describe("courseJsonLd", () => {
  it("describes the course with absolute URLs, an offer, a rating and its workload", () => {
    const data = courseJsonLd(course);
    expect(data).toMatchObject({
      "@type": "Course",
      name: "Web Basics",
      url: "https://academy.example/courses/web-basics",
      image: "https://academy.example/covers/web-basics.png",
      provider: { "@type": "Organization", name: "NUB Academy" },
      aggregateRating: { ratingValue: 4.6, ratingCount: 12 },
      offers: [{ category: "Paid", price: "29.99", priceCurrency: "USD" }],
      hasCourseInstance: [{ courseMode: "Online", courseWorkload: "PT2H30M" }],
    });
  });

  it("leaves out the rating when there are no reviews, and marks free courses Free", () => {
    const data = courseJsonLd({ ...course, price: 0, rating: { average: 0, count: 0 } });
    expect(data).not.toHaveProperty("aggregateRating");
    expect(data.offers[0]).toMatchObject({ category: "Free", price: "0.00" });
  });
});

describe("helpers", () => {
  it("builds absolute URLs from paths without doubling slashes", () => {
    expect(absoluteUrl("/courses")).toBe("https://academy.example/courses");
    expect(absoluteUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
  });

  it("cuts long descriptions on a word boundary", () => {
    const text = "word ".repeat(60);
    const result = metaDescription(text);
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith("…")).toBe(true);
    expect(metaDescription("  Short   and\nsweet ")).toBe("Short and sweet");
  });

  it("escapes < so course text can't close the JSON-LD script tag", () => {
    expect(jsonLdScript({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
