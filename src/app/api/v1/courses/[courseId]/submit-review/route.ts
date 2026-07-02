import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { submitCourseForReview } from "@/server/services/course-service";

export async function POST(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { courseId } = await params;
  const result = await submitCourseForReview(courseId, session.user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
