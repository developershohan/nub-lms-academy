import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rejectCourseSchema } from "@/lib/validations/course";
import { rejectCourse } from "@/server/services/course-service";

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { courseId } = await params;
  const body = await request.json();
  const parsed = rejectCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const result = await rejectCourse(session.user.id, courseId, parsed.data.reason);
  if ("error" in result) {
    const status = result.error === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
