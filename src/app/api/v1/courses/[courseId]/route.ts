import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { courseDetailsSchema } from "@/lib/validations/course";
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
  if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { courseId } = await params;
  const body = await request.json();
  const parsed = courseDetailsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const result = await updateCourseDetails(courseId, session.user.id, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}
