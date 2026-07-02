import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function CourseCard({
  course,
}: {
  course: {
    slug: string;
    title: string;
    subtitle: string | null;
    price: unknown;
    salePrice: unknown;
    level: string;
    category: { name: string } | null;
    teacher: { name: string | null };
  };
}) {
  const price = Number(course.price);
  const salePrice = course.salePrice != null ? Number(course.salePrice) : null;

  return (
    <Link href={`/courses/${course.slug}`}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            {course.category && <Badge variant="secondary">{course.category.name}</Badge>}
            <Badge variant="outline">{course.level.replace("_", " ")}</Badge>
          </div>
          <CardTitle className="text-base">{course.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>{course.subtitle}</p>
          <p>By {course.teacher.name ?? "Unknown instructor"}</p>
          <p className="font-medium text-foreground">
            {salePrice != null ? (
              <>
                <span className="line-through">${price.toFixed(2)}</span> ${salePrice.toFixed(2)}
              </>
            ) : price === 0 ? (
              "Free"
            ) : (
              `$${price.toFixed(2)}`
            )}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
