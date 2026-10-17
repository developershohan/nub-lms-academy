import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getStudioCourse } from "@/server/services/studio-service";
import { PricingForm } from "@/components/teacher/studio/pricing-form";
import { StudioSectionHeader } from "@/components/teacher/studio/section-header";

export const metadata = { title: "Pricing" };

export default async function CoursePricingPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  const studio = user ? await getStudioCourse(courseId, user.id) : null;
  if (!studio) notFound();
  const { course } = studio;
  const reviewed = course.status === "APPROVED" || course.status === "PUBLISHED";

  return (
    <div className="space-y-6">
      <StudioSectionHeader title="Pricing" description="Set what students pay. Checkout always charges the sale price when there is one." />
      <PricingForm
        courseId={course.id}
        price={Number(course.price)}
        salePrice={course.salePrice != null ? Number(course.salePrice) : null}
      />
      <div className="max-w-md space-y-2 text-sm text-muted-foreground">
        {reviewed && <p>Price changes on a live course are logged and shown to admins at their next review.</p>}
        <p>
          {course.isSubscriptionIncluded
            ? "Subscribers can also take this course as part of their plan."
            : "This course is sold on its own; admins decide which courses subscribers get."}
        </p>
      </div>
    </div>
  );
}
