import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedCourseBySlug } from "@/server/services/course-service";
import { getCurrentUser } from "@/lib/permissions";
import { getEnrollment } from "@/server/services/enrollment-service";
import { isWishlisted } from "@/server/services/wishlist-service";
import { listCourseReviews, getCourseRatingSummary } from "@/server/services/review-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnrollButton } from "@/components/course/enroll-button";
import { WishlistButton } from "@/components/course/wishlist-button";
import { ReviewForm } from "@/components/course/review-form";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();

  const user = await getCurrentUser();
  const [enrollment, wishlisted, reviews, ratingSummary] = await Promise.all([
    user ? getEnrollment(user.id, course.id) : null,
    user ? isWishlisted(user.id, course.id) : false,
    listCourseReviews(course.id),
    getCourseRatingSummary(course.id),
  ]);
  const isEnrolled = enrollment?.status === "ACTIVE";
  const myReview = user ? reviews.find((r) => r.userId === user.id) : undefined;

  const price = Number(course.price);
  const salePrice = course.salePrice != null ? Number(course.salePrice) : null;
  const effectivePrice = salePrice ?? price;
  const lessonCount = course.sections.reduce((sum, s) => sum + s.lessons.length, 0);

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {course.category && <Badge variant="secondary">{course.category.name}</Badge>}
            <Badge variant="outline">{course.level.replace("_", " ")}</Badge>
          </div>
          <h1 className="text-3xl font-semibold">{course.title}</h1>
          {course.subtitle && <p className="text-lg text-muted-foreground">{course.subtitle}</p>}
          <p className="text-sm text-muted-foreground">
            By {course.teacher.name ?? "Unknown instructor"} · {course.language} · {lessonCount} lessons
            {ratingSummary.count > 0 && ` · ${ratingSummary.average.toFixed(1)} (${ratingSummary.count} reviews)`}
          </p>
        </div>

        {course.description && (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Description</h2>
            <p className="whitespace-pre-line text-muted-foreground">{course.description}</p>
          </div>
        )}

        {course.outcomes.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">What you&apos;ll learn</h2>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {course.outcomes.map((o) => (
                <li key={o.id}>{o.content}</li>
              ))}
            </ul>
          </div>
        )}

        {course.requirements.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Requirements</h2>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {course.requirements.map((r) => (
                <li key={r.id}>{r.content}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Curriculum</h2>
          <div className="space-y-3">
            {course.sections.map((section) => (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle className="text-base">{section.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {section.lessons.map((lesson) => (
                    <div key={lesson.id} className="flex items-center justify-between text-sm">
                      <span>{lesson.title}</span>
                      {lesson.isPreview && <Badge variant="outline">Preview</Badge>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Reviews</h2>
          {isEnrolled && <ReviewForm courseId={course.id} slug={slug} existing={myReview} />}
          {reviews.length === 0 && <p className="text-muted-foreground">No reviews yet.</p>}
          <div className="space-y-3">
            {reviews.map((review) => (
              <Card key={review.id}>
                <CardContent className="space-y-1 pt-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>{review.user.name ?? "Student"}</span>
                    <Badge variant="outline">{review.rating} stars</Badge>
                  </div>
                  {review.comment && <p className="text-sm text-muted-foreground">{review.comment}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Card className="h-fit">
        <CardContent className="space-y-4 pt-6">
          <p className="text-3xl font-semibold">
            {salePrice != null ? (
              <>
                <span className="mr-2 text-lg text-muted-foreground line-through">${price.toFixed(2)}</span>$
                {salePrice.toFixed(2)}
              </>
            ) : price === 0 ? (
              "Free"
            ) : (
              `$${price.toFixed(2)}`
            )}
          </p>

          {!user && (
            <Button className="w-full" render={<Link href={`/login?callbackUrl=/courses/${slug}`} />}>
              Log in to enroll
            </Button>
          )}
          {user && isEnrolled && (
            <Button className="w-full" render={<Link href={`/student/course/${course.id}/learn`} />}>
              Continue learning
            </Button>
          )}
          {user && !isEnrolled && effectivePrice === 0 && <EnrollButton courseId={course.id} />}
          {user && !isEnrolled && effectivePrice > 0 && (
            <Button className="w-full" disabled>
              Buy course (coming in Phase 6)
            </Button>
          )}

          {user && <WishlistButton courseId={course.id} slug={slug} wishlisted={wishlisted} />}
        </CardContent>
      </Card>
    </div>
  );
}
