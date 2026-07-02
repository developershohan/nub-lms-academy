import { notFound } from "next/navigation";
import { getPublishedCourseBySlug } from "@/server/services/course-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();

  const price = Number(course.price);
  const salePrice = course.salePrice != null ? Number(course.salePrice) : null;
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
          <Button className="w-full" disabled>
            Enroll (coming in Phase 3)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
