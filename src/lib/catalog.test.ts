import { describe, expect, it } from "vitest";
import { buildCatalogWhere, catalogHref, catalogOrderBy, pageWindow, parseCatalogParams } from "./catalog";

describe("parseCatalogParams", () => {
  it("reads repeated and comma-separated values and drops unknown ones", () => {
    const params = parseCatalogParams({
      q: "  react ",
      level: ["BEGINNER", "NOPE"],
      price: "free,paid",
      duration: "1-3",
      rating: "4.5",
      sort: "price-asc",
      page: "2",
    });
    expect(params).toMatchObject({
      q: "react",
      levels: ["BEGINNER"],
      prices: ["free", "paid"],
      durations: ["1-3"],
      minRating: 4.5,
      sort: "price-asc",
      page: 2,
    });
  });

  it("falls back to safe defaults for junk input", () => {
    expect(parseCatalogParams({ rating: "7", sort: "zzz", page: "-3" })).toMatchObject({
      minRating: null,
      sort: "recommended",
      page: 1,
    });
  });
});

describe("buildCatalogWhere", () => {
  const base = parseCatalogParams({});

  it("only ever lists published courses", () => {
    expect(buildCatalogWhere(base)).toEqual({ AND: [{ status: "PUBLISHED" }] });
  });

  it("requires every search word to match somewhere", () => {
    const where = buildCatalogWhere({ ...base, q: "react next" });
    expect(where.AND).toHaveLength(3);
  });

  it("treats one price as a filter and both prices as no filter", () => {
    expect(JSON.stringify(buildCatalogWhere({ ...base, prices: ["free"] }))).toContain('"effectivePrice":{"equals":0}');
    expect(buildCatalogWhere({ ...base, prices: ["free", "paid"] })).toEqual(buildCatalogWhere(base));
  });

  it("leaves one facet out when computing that facet's counts", () => {
    const params = { ...base, levels: ["BEGINNER" as const], minRating: 4 };
    const where = JSON.stringify(buildCatalogWhere(params, "levels"));
    expect(where).not.toContain("BEGINNER");
    expect(where).toContain('"ratingAvg":{"gte":4}');
  });

  it("matches open-ended duration buckets", () => {
    expect(JSON.stringify(buildCatalogWhere({ ...base, durations: ["6+"] }))).toContain('"totalDurationSec":{"gte":21600}');
  });
});

describe("catalogOrderBy", () => {
  it("sorts by the stored price and rating columns", () => {
    expect(catalogOrderBy("price-asc")[0]).toEqual({ effectivePrice: "asc" });
    expect(catalogOrderBy("rating")[0]).toEqual({ ratingAvg: "desc" });
    expect(catalogOrderBy("recommended")[0]).toEqual({ isFeatured: "desc" });
  });
});

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("collapses the middle with gaps around the current page", () => {
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageWindow(1, 12)).toEqual([1, 2, null, 12]);
  });
});

describe("catalogHref", () => {
  it("changes one filter, keeps the rest and goes back to page 1", () => {
    const href = catalogHref(new URLSearchParams("q=react&level=BEGINNER&page=3"), { level: ["BEGINNER", "ADVANCED"] });
    expect(href).toBe("/courses?q=react&level=BEGINNER&level=ADVANCED");
  });

  it("keeps the page when the page itself is what changes, and drops removed filters", () => {
    expect(catalogHref({ q: "react", rating: "4" }, { page: "2" })).toBe("/courses?q=react&rating=4&page=2");
    expect(catalogHref({ rating: "4" }, { rating: null })).toBe("/courses");
  });
});
