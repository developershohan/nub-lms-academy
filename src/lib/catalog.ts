import type { CourseLevel, Prisma } from "@/generated/prisma/client";

export const CATALOG_PAGE_SIZE = 12;

export const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"] as const satisfies readonly CourseLevel[];
export const PRICES = ["free", "paid"] as const;
export const RATINGS = [4.5, 4, 3.5, 3] as const;
export const DURATIONS = {
  "0-1": { label: "Under 1 hour", minSec: 0, maxSec: 3600 },
  "1-3": { label: "1-3 hours", minSec: 3600, maxSec: 3 * 3600 },
  "3-6": { label: "3-6 hours", minSec: 3 * 3600, maxSec: 6 * 3600 },
  "6+": { label: "6+ hours", minSec: 6 * 3600, maxSec: null },
} as const;
export type DurationKey = keyof typeof DURATIONS;

export const SORTS = {
  recommended: "Recommended",
  popular: "Most popular",
  rating: "Highest rated",
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
} as const;
export type SortKey = keyof typeof SORTS;

export type CatalogParams = {
  q: string;
  categories: string[];
  levels: CourseLevel[];
  prices: (typeof PRICES)[number][];
  minRating: number | null;
  durations: DurationKey[];
  languages: string[];
  sort: SortKey;
  page: number;
};

export type Facet = "categories" | "levels" | "prices" | "minRating" | "durations" | "languages";

type RawParams = Record<string, string | string[] | undefined>;

/** Values may arrive as ?level=a&level=b or ?level=a,b - accept both, keep only known ones. */
function list(raw: RawParams, key: string) {
  const value = raw[key];
  const parts = (Array.isArray(value) ? value : value ? [value] : []).flatMap((v) => v.split(","));
  return [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
}

function oneOf<T extends string>(values: string[], allowed: readonly T[]) {
  return values.filter((v): v is T => (allowed as readonly string[]).includes(v));
}

/** Reads the catalogue's URL search params defensively: unknown values are dropped, never thrown on. */
export function parseCatalogParams(raw: RawParams): CatalogParams {
  const first = (key: string) => list(raw, key)[0];
  const rating = Number(first("rating"));
  const page = Number.parseInt(first("page") ?? "1", 10);
  const sort = first("sort");

  return {
    q: (first("q") ?? "").slice(0, 100),
    categories: list(raw, "category").slice(0, 20),
    levels: oneOf(list(raw, "level"), LEVELS),
    prices: oneOf(list(raw, "price"), PRICES),
    minRating: (RATINGS as readonly number[]).includes(rating) ? rating : null,
    durations: oneOf(list(raw, "duration"), Object.keys(DURATIONS) as DurationKey[]),
    languages: list(raw, "language").slice(0, 10),
    sort: sort && sort in SORTS ? (sort as SortKey) : "recommended",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Every search word must appear somewhere - title, subtitle, description, instructor or category. */
function searchWhere(q: string): Prisma.CourseWhereInput[] {
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
  return terms.map((term) => {
    const contains = { contains: term, mode: "insensitive" as const };
    return {
      OR: [
        { title: contains },
        { subtitle: contains },
        { description: contains },
        { teacher: { name: contains } },
        { category: { name: contains } },
      ],
    };
  });
}

/**
 * The Prisma filter for the catalogue. `except` leaves one facet out - that's how the count beside
 * each filter option is computed (how many results you'd get if you picked it, given the others).
 */
export function buildCatalogWhere(params: CatalogParams, except?: Facet): Prisma.CourseWhereInput {
  const and: Prisma.CourseWhereInput[] = [{ status: "PUBLISHED" }, ...searchWhere(params.q)];

  if (except !== "categories" && params.categories.length) and.push({ category: { slug: { in: params.categories } } });
  if (except !== "levels" && params.levels.length) and.push({ level: { in: params.levels } });
  if (except !== "languages" && params.languages.length) and.push({ language: { in: params.languages } });
  if (except !== "minRating" && params.minRating != null) and.push({ ratingAvg: { gte: params.minRating } });
  if (except !== "prices" && params.prices.length === 1) {
    and.push(params.prices[0] === "free" ? { effectivePrice: { equals: 0 } } : { effectivePrice: { gt: 0 } });
  }
  if (except !== "durations" && params.durations.length) {
    and.push({ OR: params.durations.map(durationWhere) });
  }
  return { AND: and };
}

export function durationWhere(key: DurationKey): Prisma.CourseWhereInput {
  const { minSec, maxSec } = DURATIONS[key];
  return { totalDurationSec: maxSec == null ? { gte: minSec } : { gte: minSec, lt: maxSec } };
}

export function catalogOrderBy(sort: SortKey): Prisma.CourseOrderByWithRelationInput[] {
  switch (sort) {
    case "popular":
      return [{ enrollments: { _count: "desc" } }, { ratingCount: "desc" }, { publishedAt: "desc" }];
    case "rating":
      return [{ ratingAvg: "desc" }, { ratingCount: "desc" }, { publishedAt: "desc" }];
    case "newest":
      return [{ publishedAt: "desc" }];
    case "price-asc":
      return [{ effectivePrice: "asc" }, { publishedAt: "desc" }];
    case "price-desc":
      return [{ effectivePrice: "desc" }, { publishedAt: "desc" }];
    default:
      // Admin-featured courses first, then the best-reviewed, then the newest.
      return [{ isFeatured: "desc" }, { ratingAvg: "desc" }, { ratingCount: "desc" }, { publishedAt: "desc" }];
  }
}

/** Page numbers to show: always the first and last, the current one and its neighbours, with
 * null marking a gap ("1 … 4 5 6 … 12"). */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) out.push(null);
    out.push(page);
  });
  return out;
}

/** The current URL's params with some keys replaced (or removed with null); any filter change
 * goes back to page 1. */
export function catalogHref(
  current: URLSearchParams | Record<string, string | string[] | undefined>,
  changes: Record<string, string | string[] | null>,
  pathname = "/courses"
) {
  const params =
    current instanceof URLSearchParams
      ? new URLSearchParams(current)
      : new URLSearchParams(
          Object.entries(current).flatMap(([key, value]) =>
            value == null ? [] : (Array.isArray(value) ? value : [value]).map((v) => [key, v] as [string, string])
          )
        );
  for (const [key, value] of Object.entries(changes)) {
    params.delete(key);
    if (value == null) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  if (!("page" in changes)) params.delete("page");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
