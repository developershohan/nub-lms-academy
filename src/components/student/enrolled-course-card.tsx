import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function EnrolledCourseCard({
  courseId,
  title,
  categoryName,
  percent,
}: {
  courseId: string;
  title: string;
  categoryName?: string | null;
  percent: number;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {categoryName && <span className="text-sm text-muted-foreground">{categoryName}</span>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Progress value={percent} />
          <span className="text-sm text-muted-foreground">{percent}%</span>
        </div>
        <Link href={`/student/course/${courseId}/learn`} className="text-sm font-medium underline">
          {percent > 0 ? "Continue learning" : "Start learning"}
        </Link>
      </CardContent>
    </Card>
  );
}
