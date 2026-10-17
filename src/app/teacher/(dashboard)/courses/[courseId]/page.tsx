import { notFound } from "next/navigation";
import { CircleCheckBig, DollarSign, Star, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { formatCount, formatMoney } from "@/lib/format";
import { getCoursePerformance, getStudioCourse } from "@/server/services/studio-service";
import { COURSE_STATUS } from "@/components/teacher/studio/course-status";
import { PublishChecklist } from "@/components/teacher/studio/publish-checklist";
import { ReviewList } from "@/components/teacher/studio/review-list";
import { StatTile } from "@/components/teacher/studio/stat-tile";
import { SubmitReviewButton } from "@/components/teacher/submit-review-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Course studio" };

export default async function CourseStudioOverviewPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  const studio = user ? await getStudioCourse(courseId, user.id) : null;
  if (!studio) notFound();

  const { course, checklist } = studio;
  const performance = await getCoursePerformance(course.id);
  const canSubmit = course.status === "DRAFT" || course.status === "REJECTED";
  const reviewed = course.status === "APPROVED" || course.status === "PUBLISHED";
  const showNumbers = course.status === "PUBLISHED" || course.status === "ARCHIVED" || performance.students > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">{COURSE_STATUS[course.status].label}</CardTitle>
          <CardDescription>{COURSE_STATUS[course.status].summary}</CardDescription>
        </CardHeader>
        {(course.status === "REJECTED" && course.rejectionReason) || (reviewed && course.changedSinceReviewAt) || canSubmit ? (
          <CardContent className="space-y-4">
            {course.status === "REJECTED" && course.rejectionReason && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">What the reviewer asked for</p>
                <p className="mt-1 whitespace-pre-line">{course.rejectionReason}</p>
              </div>
            )}
            {reviewed && course.changedSinceReviewAt && (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                You changed this course on{" "}
                {course.changedSinceReviewAt.toLocaleDateString("en-US", { dateStyle: "medium" })}. An admin will look
                over the changes; the course stays live meanwhile.
              </p>
            )}
            {canSubmit && <SubmitReviewButton courseId={course.id} ready={checklist.ready} />}
          </CardContent>
        ) : null}
      </Card>

      {showNumbers && (
        <section aria-labelledby="performance-heading" className="space-y-3">
          <h2 id="performance-heading" className="font-heading text-lg font-semibold">
            Performance
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={Users} label="Students" value={formatCount(performance.students)} />
            <StatTile
              icon={CircleCheckBig}
              label="Completed"
              value={formatCount(performance.completions)}
              detail={
                performance.students > 0
                  ? `${Math.round((performance.completions / performance.students) * 100)}% of students`
                  : undefined
              }
            />
            <StatTile icon={DollarSign} label="Sales" value={formatMoney(performance.sales)} detail="After coupons" />
            <StatTile
              icon={Star}
              label="Rating"
              value={course.ratingCount > 0 ? course.ratingAvg.toFixed(1) : "–"}
              detail={`${formatCount(course.ratingCount)} ${course.ratingCount === 1 ? "review" : "reviews"}`}
            />
          </div>
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Publish checklist</CardTitle>
          <CardDescription>
            {reviewed
              ? "Keep these in shape as you update the course."
              : "Everything required must be done before you can submit the course for review."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PublishChecklist courseId={course.id} checklist={checklist} />
        </CardContent>
      </Card>

      {performance.reviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Latest reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <ReviewList reviews={performance.reviews} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
