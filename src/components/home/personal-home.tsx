import Link from "next/link";
import { Compass } from "lucide-react";
import { getRoleHome } from "@/lib/role-home";
import type { RoleName } from "@/generated/prisma/client";
import {
  getBecauseYouViewed,
  getFavouriteCategory,
  listContinueLearning,
  listOwnedCourseIds,
} from "@/server/services/home-service";
import { getCachedTopInstructors, getCachedTrending } from "@/server/services/home-cache";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ContinueLearning, CourseRail, Eyebrow, TopInstructors } from "@/components/home/home-sections";

/**
 * The home page for a signed-in learner: their unfinished courses first, then recommendations.
 * Shared lists come from the cache (home-cache.ts) and are filtered here to drop courses they own.
 */
export async function PersonalHome({ user }: { user: { id: string; name: string | null; roles: RoleName[] } }) {
  const owned = await listOwnedCourseIds(user.id);
  const [continueLearning, becauseYouViewed, favourite, instructors] = await Promise.all([
    listContinueLearning(user.id),
    getBecauseYouViewed(user.id, owned),
    getFavouriteCategory(user.id),
    getCachedTopInstructors(),
  ]);
  // Don't repeat a course on the page: the one they viewed, or what is already recommended for it.
  const shown = new Set([becauseYouViewed?.basedOn.id, ...(becauseYouViewed?.courses.map((c) => c.id) ?? [])]);
  const trending = (await getCachedTrending(favourite?.id ?? null))
    .filter((course) => !owned.has(course.id) && !shown.has(course.id))
    .slice(0, 4);

  const firstName = user.name?.split(/\s+/)[0];
  const dashboard = getRoleHome(user.roles);
  const isStudentOnly = dashboard === "/student/dashboard";

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Your learning</Eyebrow>
          <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/courses" />}>
            Browse courses
          </Button>
          <Button render={<Link href={isStudentOnly ? "/student/my-courses" : dashboard} />}>
            {isStudentOnly ? "My courses" : "Go to dashboard"}
          </Button>
        </div>
      </header>

      {continueLearning.length > 0 ? (
        <ContinueLearning items={continueLearning} />
      ) : owned.size === 0 ? (
        <EmptyState
          icon={Compass}
          title="Find your first course"
          description="Browse the catalogue by topic, level and price. Free courses start the moment you enroll."
        >
          <Button render={<Link href="/courses" />}>Browse courses</Button>
        </EmptyState>
      ) : null}

      {becauseYouViewed && (
        <CourseRail
          id="because-heading"
          eyebrow="Because you viewed"
          title={becauseYouViewed.basedOn.title}
          courses={becauseYouViewed.courses}
        />
      )}

      <CourseRail
        id="trending-heading"
        eyebrow="Trending this month"
        title={favourite ? `Popular in ${favourite.name}` : "Popular right now"}
        href={favourite ? `/categories/${favourite.slug}` : "/courses?sort=popular"}
        linkLabel={favourite ? `More ${favourite.name}` : "View all"}
        courses={trending}
      />

      <TopInstructors instructors={instructors} />
    </div>
  );
}
