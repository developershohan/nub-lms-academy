import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rejectCourseSchema } from "@/lib/validations/course";
import { parseJsonBody } from "@/lib/http/json";
import { rejectCourse } from "@/server/services/course-service";

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { courseId } = await params;
  const parsed = await parseJsonBody(request, rejectCourseSchema);
  if ("response" in parsed) return parsed.response;

  const result = await rejectCourse(session.user.id, courseId, parsed.data.reason);
  if ("error" in result) {
    const status = result.error === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
