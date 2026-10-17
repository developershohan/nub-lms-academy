import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getStudioCourse } from "@/server/services/studio-service";
import { listCategories } from "@/server/services/category-service";
import { LandingForm } from "@/components/teacher/studio/landing-form";
import { StudioSectionHeader } from "@/components/teacher/studio/section-header";

export const metadata = { title: "Landing page" };

export default async function CourseLandingPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  const [studio, categories] = await Promise.all([
    user ? getStudioCourse(courseId, user.id) : null,
    listCategories(),
  ]);
  if (!user || !studio) notFound();
  const { course } = studio;

  return (
    <div className="space-y-6">
      <StudioSectionHeader
        title="Landing page"
        description="What students see on the catalogue card and the course page before they enroll."
      />
      <LandingForm
        courseId={course.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        teacherName={user.name ?? null}
        pricing={{ price: Number(course.price), salePrice: course.salePrice != null ? Number(course.salePrice) : null }}
        course={{
          title: course.title,
          subtitle: course.subtitle,
          description: course.description,
          categoryId: course.categoryId,
          level: course.level,
          language: course.language,
          thumbnailUrl: course.thumbnailUrl,
          promoVideoUrl: course.promoVideoUrl,
        }}
      />
    </div>
  );
}
