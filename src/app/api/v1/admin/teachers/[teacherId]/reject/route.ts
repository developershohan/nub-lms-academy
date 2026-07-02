import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rejectTeacherApplication } from "@/server/services/teacher-service";

export async function POST(_request: Request, { params }: { params: Promise<{ teacherId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teacherId } = await params;
  const result = await rejectTeacherApplication(session.user.id, teacherId);
  if ("error" in result) {
    const status = result.error === "Forbidden" ? 403 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
