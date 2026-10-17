import "server-only";
import { prisma } from "@/lib/prisma";
import {
  CATALOG_PAGE_SIZE,
  DURATIONS,
  LEVELS,
  RATINGS,
  buildCatalogWhere,
  catalogOrderBy,
  durationWhere,
  type CatalogParams,
  type DurationKey,
} from "@/lib/catalog";

export type CatalogFacets = Awaited<ReturnType<typeof getFacetCounts>>;

/** One page of catalogue results plus the counts shown beside every filter option. */
export async function searchCatalog(params: CatalogParams) {
  const where = buildCatalogWhere(params);
  const total = await prisma.course.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const page = Math.min(params.page, pageCount);

  const [courses, facets] = await Promise.all([
    prisma.course.findMany({
      where,
      orderBy: catalogOrderBy(params.sort),
      skip: (page - 1) * CATALOG_PAGE_SIZE,
      take: CATALOG_PAGE_SIZE,
      include: { category: true, teacher: { select: { name: true } } },
    }),
    getFacetCounts(params),
  ]);

  return { courses, total, page, pageCount, facets };
}

/** For each facet: how many results each option would give, keeping every *other* active filter. */
async function getFacetCounts(params: CatalogParams) {
  const countWith = (facet: Parameters<typeof buildCatalogWhere>[1], extra: object) =>
    prisma.course.count({ where: { AND: [buildCatalogWhere(params, facet), extra] } });
  const durationKeys = Object.keys(DURATIONS) as DurationKey[];

  const [categoryGroups, levelGroups, languageGroups, free, paid, ratingCounts, durationCounts, categories] =
    await Promise.all([
      prisma.course.groupBy({ by: ["categoryId"], where: buildCatalogWhere(params, "categories"), _count: { _all: true } }),
      prisma.course.groupBy({ by: ["level"], where: buildCatalogWhere(params, "levels"), _count: { _all: true } }),
      prisma.course.groupBy({ by: ["language"], where: buildCatalogWhere(params, "languages"), _count: { _all: true } }),
      countWith("prices", { effectivePrice: { equals: 0 } }),
      countWith("prices", { effectivePrice: { gt: 0 } }),
      Promise.all(RATINGS.map((rating) => countWith("minRating", { ratingAvg: { gte: rating } }))),
      Promise.all(durationKeys.map((key) => countWith("durations", durationWhere(key)))),
      prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } }),
    ]);

  const byCategory = new Map(categoryGroups.map((g) => [g.categoryId, g._count._all]));
  const byLevel = new Map(levelGroups.map((g) => [g.level, g._count._all]));

  return {
    categories: categories
      .map((c) => ({ value: c.slug, label: c.name, count: byCategory.get(c.id) ?? 0 }))
      // A category with nothing to show (and not already picked) is just noise in the list.
      .filter((c) => c.count > 0 || params.categories.includes(c.value)),
    levels: LEVELS.map((level) => ({ value: level, count: byLevel.get(level) ?? 0 })),
    languages: languageGroups
      .map((g) => ({ value: g.language, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    prices: [
      { value: "free" as const, count: free },
      { value: "paid" as const, count: paid },
    ],
    ratings: RATINGS.map((rating, i) => ({ value: rating, count: ratingCounts[i] })),
    durations: durationKeys.map((key, i) => ({ value: key, count: durationCounts[i] })),
  };
}
