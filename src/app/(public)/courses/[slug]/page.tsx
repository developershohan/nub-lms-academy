import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, CalendarClock, Check, ChevronRight, Globe, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { RecordCourseView } from "@/components/course/record-course-view";
import { getEnrollment } from "@/server/services/enrollment-service";
import { isWishlisted } from "@/server/services/wishlist-service";
import { getCourseLanding } from "@/server/services/course-landing-service";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { EnrollButton } from "@/components/course/enroll-button";
import { WishlistButton } from "@/components/course/wishlist-button";
import { ReviewForm } from "@/components/course/review-form";
import { CheckoutButton } from "@/components/course/checkout-button";
import { CourseCard } from "@/components/course/course-card";
import { CourseBuyBox, PriceTag, type CoursePricing } from "@/components/course/course-buy-box";
import { CourseCurriculum } from "@/components/course/course-curriculum";
import { ExpandableText } from "@/components/course/expandable-text";
import { InstructorCard } from "@/components/course/instructor-card";
import { RatingBreakdown } from "@/components/course/rating-breakdown";
import { RatingStars } from "@/components/course/rating-stars";
import { formatCount, formatMonthYear, formatRelativeDate } from "@/lib/format";
import { absoluteUrl, courseJsonLd, jsonLdScript, metaDescription } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const landing = await getCourseLanding(slug);
  if (!landing) return { title: "Course not found" };

  const { course } = landing;
  const description = metaDescription(course.subtitle || course.description) || `Learn ${course.title} on NUB Academy.`;
  // Social networks don't render SVG previews; the seeded covers are SVGs, so only raster
  // thumbnails are offered as the share image.
  const image = course.thumbnailUrl && !course.thumbnailUrl.endsWith(".svg") ? absoluteUrl(course.thumbnailUrl) : undefined;
  return {
    title: course.title,
    description,
    alternates: { canonical: `/courses/${slug}` },
    openGraph: {
      type: "website",
      url: `/courses/${slug}`,
      title: course.title,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: course.title, description },
  };
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="font-heading text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function lines(text: string | null) {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default async function CourseDetailPage({ params }: Props) {
  const { slug } = await params;
  const landing = await getCourseLanding(slug);
  if (!landing) notFound();
  const { course, rating, reviews, previews, instructor, stats, studentCount } = landing;

  const user = await getCurrentUser();
  const [enrollment, wishlisted, myReview] = await Promise.all([
    user ? getEnrollment(user.id, course.id) : null,
    user ? isWishlisted(user.id, course.id) : false,
    user ? prisma.courseReview.findUnique({ where: { userId_courseId: { userId: user.id, courseId: course.id } } }) : null,
  ]);
  const isEnrolled = enrollment?.status === "ACTIVE";

  const price = Number(course.price);
  const salePrice = course.salePrice != null ? Number(course.salePrice) : null;
  const pricing: CoursePricing = { price, salePrice, effectivePrice: salePrice ?? price };
  const audience = lines(course.targetAudience);

  const renderCta = (compact: boolean) => !user ? (
    <Button size="lg" className="w-full" render={<Link href={`/login?callbackUrl=/courses/${slug}`} />}>
      {pricing.effectivePrice === 0 ? "Log in to enroll for free" : "Log in to buy"}
    </Button>
  ) : isEnrolled ? (
    <Button size="lg" className="w-full" render={<Link href={`/student/course/${course.id}/learn`} />}>
      Go to course
    </Button>
  ) : pricing.effectivePrice === 0 ? (
    <EnrollButton courseId={course.id} />
  ) : (
    <CheckoutButton courseId={course.id} compact={compact} />
  );

  const jsonLd = courseJsonLd({
    slug,
    title: course.title,
    description: metaDescription(course.description || course.subtitle || course.title, 500),
    language: course.language,
    imageUrl: course.thumbnailUrl,
    price: pricing.effectivePrice,
    instructorName: course.teacher.name,
    totalDurationSec: stats.totalDurationSec,
    rating,
  });

  return (
    <div className="pb-24 lg:pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      {user && <RecordCourseView courseId={course.id} />}

      {/* Hero */}
      <section className="border-b bg-muted/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-14">
          <div className="space-y-4">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <Link href="/courses" className="hover:text-foreground">
                Courses
              </Link>
              {course.category && (
                <>
                  <ChevronRight className="size-3.5" aria-hidden />
                  <Link href={`/categories/${course.category.slug}`} className="hover:text-foreground">
                    {course.category.name}
                  </Link>
                </>
              )}
            </nav>
            <h1 className="font-heading text-3xl font-semibold leading-tight md:text-4xl">{course.title}</h1>
            {course.subtitle && <p className="text-lg text-muted-foreground">{course.subtitle}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {rating.count > 0 ? (
                <a href="#reviews" className="flex items-center gap-1.5">
                  <span className="font-semibold text-amber-foreground dark:text-amber">{rating.average.toFixed(1)}</span>
                  <RatingStars value={rating.average} />
                  <span className="text-muted-foreground underline underline-offset-2">
                    ({formatCount(rating.count)} {rating.count === 1 ? "rating" : "ratings"})
                  </span>
                </a>
              ) : (
                <span className="text-muted-foreground">No ratings yet</span>
              )}
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="size-4" aria-hidden />
                {formatCount(studentCount)} {studentCount === 1 ? "student" : "students"}
              </span>
            </div>
            <p className="text-sm">
              Created by{" "}
              <a href="#instructor" className="font-medium text-primary underline-offset-4 hover:underline">
                {course.teacher.name ?? "Unknown instructor"}
              </a>
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <CalendarClock className="size-4" aria-hidden />
                Last updated {formatMonthYear(course.updatedAt)}
              </li>
              <li className="flex items-center gap-1.5">
                <Globe className="size-4" aria-hidden />
                {course.language}
              </li>
              <li className="flex items-center gap-1.5">
                <BarChart3 className="size-4" aria-hidden />
                {course.level.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <aside className="lg:order-last">
          <div className="lg:sticky lg:top-20 lg:-mt-64">
            <CourseBuyBox
              title={course.title}
              thumbnailUrl={course.thumbnailUrl}
              promoVideoUrl={course.promoVideoUrl}
              category={course.category}
              pricing={pricing}
              stats={stats}
              isSubscriptionIncluded={course.isSubscriptionIncluded}
            >
              {renderCta(false)}
              {user && !isEnrolled && <WishlistButton courseId={course.id} slug={slug} wishlisted={wishlisted} />}
            </CourseBuyBox>
          </div>
        </aside>

        <div className="min-w-0 space-y-12">
          {course.outcomes.length > 0 && (
            <section className="space-y-4 rounded-xl border p-6">
              <h2 className="font-heading text-2xl font-semibold">What you&apos;ll learn</h2>
              <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {course.outcomes.map((outcome) => (
                  <li key={outcome.id} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {outcome.content}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Section title="Course content">
            <CourseCurriculum sections={course.sections} previews={previews} stats={stats} />
          </Section>

          {course.requirements.length > 0 && (
            <Section title="Requirements">
              <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                {course.requirements.map((requirement) => (
                  <li key={requirement.id}>{requirement.content}</li>
                ))}
              </ul>
            </Section>
          )}

          {course.description && (
            <Section title="Description">
              <ExpandableText text={course.description} />
            </Section>
          )}

          {audience.length > 0 && (
            <Section title="Who this course is for">
              <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                {audience.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Instructor" id="instructor">
            <InstructorCard teacher={course.teacher} summary={instructor} />
          </Section>

          <Section title="Student feedback" id="reviews">
            {rating.count > 0 ? (
              <RatingBreakdown rating={rating} />
            ) : (
              <p className="text-muted-foreground">No reviews yet. Enrolled students can leave the first one.</p>
            )}
            {isEnrolled && (
              <div className="rounded-xl border p-5">
                <p className="mb-3 font-medium">{myReview ? "Update your review" : "Review this course"}</p>
                <ReviewForm
                  key={myReview?.updatedAt.getTime() ?? "new"}
                  courseId={course.id}
                  slug={slug}
                  existing={myReview ?? undefined}
                />
              </div>
            )}
            {reviews.length > 0 && (
              <ul className="grid gap-4 sm:grid-cols-2">
                {reviews.map((review) => (
                  <li key={review.id} className="space-y-2 rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{review.user.name ?? "Student"}</span>
                      <span className="text-xs text-muted-foreground">{formatRelativeDate(review.createdAt)}</span>
                    </div>
                    <RatingStars value={review.rating} />
                    {review.comment && <p className="text-sm leading-relaxed text-muted-foreground">{review.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
            {rating.count > reviews.length && (
              <p className="text-sm text-muted-foreground">
                Showing the {reviews.length} most recent of {formatCount(rating.count)} reviews.
              </p>
            )}
          </Section>

          {instructor.otherCourses.length > 0 && (
            <Section title={`More from ${course.teacher.name ?? "this instructor"}`}>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {instructor.otherCourses.map((other) => (
                  <CourseCard key={other.id} course={other} />
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Phones: the buy box scrolls away, so keep the price and the main action in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <PriceTag pricing={pricing} compact />
          <div className="ml-auto w-44">{renderCta(true)}</div>
        </div>
      </div>
    </div>
  );
}
