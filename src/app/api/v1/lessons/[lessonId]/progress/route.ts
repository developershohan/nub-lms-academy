import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { progressSchema } from "@/lib/validations/learning";
import { recordLessonProgress } from "@/server/services/progress-service";

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

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
