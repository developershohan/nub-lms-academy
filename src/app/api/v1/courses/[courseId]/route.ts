import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { courseDetailsSchema } from "@/lib/validations/course";
import { parseJsonBody } from "@/lib/http/json";
import { getCourseDetailForViewer, updateCourseDetails } from "@/server/services/course-service";

export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const session = await auth();
  const course = await getCourseDetailForViewer(courseId, session?.user?.id);
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ course });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { courseId } = await params;
  const parsed = await parseJsonBody(request, courseDetailsSchema);
  if ("response" in parsed) return parsed.response;

  const result = await updateCourseDetails(courseId, session.user.id, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}
