import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { approveCourse } from "@/server/services/course-service";

export async function POST(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { courseId } = await params;
  const result = await approveCourse(session.user.id, courseId);
  if ("error" in result) {
    const status = result.error === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
