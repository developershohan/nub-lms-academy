export const SITE_NAME = "NUB Academy";

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function absoluteUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Plain-text summary for meta descriptions: whitespace collapsed, cut at a word near 160 chars. */
export function metaDescription(text: string | null | undefined, max = 160) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd()}…`;
}

function isoDuration(totalSec: number) {
  const minutes = Math.max(1, Math.round(totalSec / 60));
  const hours = Math.floor(minutes / 60);
  return `PT${hours ? `${hours}H` : ""}${minutes % 60 ? `${minutes % 60}M` : ""}`;
}

/**
 * schema.org Course markup for Google's course rich results: name, description and provider are
 * required; offers, rating and a course instance make the result richer. Ratings are only included
 * when real reviews exist - Google penalises self-made or empty ratings.
 */
export function courseJsonLd(course: {
  slug: string;
  title: string;
  description: string;
  language: string;
  imageUrl: string | null;
  price: number;
  instructorName: string | null;
  totalDurationSec: number;
  rating: { average: number; count: number };
}) {
  const url = absoluteUrl(`/courses/${course.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description,
    url,
    inLanguage: course.language,
    ...(course.imageUrl ? { image: absoluteUrl(course.imageUrl) } : {}),
    provider: { "@type": "Organization", name: SITE_NAME, sameAs: siteUrl() },
    ...(course.rating.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: course.rating.average,
            ratingCount: course.rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers: [
      {
        "@type": "Offer",
        category: course.price > 0 ? "Paid" : "Free",
        price: course.price.toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url,
      },
    ],
    hasCourseInstance: [
      {
        "@type": "CourseInstance",
        courseMode: "Online",
        ...(course.totalDurationSec > 0 ? { courseWorkload: isoDuration(course.totalDurationSec) } : {}),
        ...(course.instructorName ? { instructor: [{ "@type": "Person", name: course.instructorName }] } : {}),
      },
    ],
  };
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so text can't close the tag. */
export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
