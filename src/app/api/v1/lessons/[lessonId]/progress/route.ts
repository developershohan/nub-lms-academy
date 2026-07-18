import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { progressSchema } from "@/lib/validations/learning";
import { parseJsonBody } from "@/lib/http/json";
import { recordLessonProgress } from "@/server/services/progress-service";

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = await parseJsonBody(request, progressSchema);
  if ("response" in parsed) return parsed.response;

  const { lessonId } = await params;
  const result = await recordLessonProgress(
    session.user.id,
    lessonId,
    parsed.data.watchedSeconds,
    !!parsed.data.completed
  );
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true });
}
