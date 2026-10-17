import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { listFeaturedCourses } from "@/server/services/course-service";
import { listCategoriesWithCounts } from "@/server/services/category-service";
import { listTopInstructors, listTrendingCourses } from "@/server/services/home-service";

/*
 * Home page data that is the same for every visitor, cached across requests. Results go through
 * JSON, so dates come back as strings and Decimals as strings: nothing on the home page reads a
 * date from these, and prices are read with Number(). Course edits that change what the home page
 * shows revalidate HOME_CACHE_TAG (see revalidateCoursePaths); everything else ages out.
 */
export const HOME_CACHE_TAG = "home";
const options = { revalidate: 600, tags: [HOME_CACHE_TAG] };

export const getCachedFeatured = unstable_cache(() => listFeaturedCourses(7), ["home:featured"], options);

export const getCachedCategories = unstable_cache(() => listCategoriesWithCounts(), ["home:categories"], options);

export const getCachedStats = unstable_cache(
  async () => {
    const [courses, teachers] = await Promise.all([
      prisma.course.count({ where: { status: "PUBLISHED" } }),
      prisma.course
        .findMany({ where: { status: "PUBLISHED" }, distinct: ["teacherId"], select: { teacherId: true } })
        .then((rows) => rows.length),
    ]);
    return { courses, teachers };
  },
  ["home:stats"],
  options
);

/** Keyed by category (null = the whole catalogue) - unstable_cache folds arguments into the key. */
export const getCachedTrending = unstable_cache(
  (categoryId: string | null) => listTrendingCourses({ categoryId, take: 12 }),
  ["home:trending"],
  options
);

export const getCachedTopInstructors = unstable_cache(() => listTopInstructors(4), ["home:instructors"], options);
