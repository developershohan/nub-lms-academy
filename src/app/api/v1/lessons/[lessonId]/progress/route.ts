import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { progressSchema, videoProgressSchema } from "@/lib/validations/learning";
import { parseJsonBody } from "@/lib/http/json";
import { recordLessonProgress, recordVideoProgress } from "@/server/services/progress-service";

/** Either a player report ({ positionSec, ended? }, capped by real time) or a manual completion
 * ({ completed: true }). A watchedSeconds sent by older clients is ignored. */
const bodySchema = z.union([videoProgressSchema, progressSchema]);

export async function POST(request: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = await parseJsonBody(request, bodySchema);
  if ("response" in parsed) return parsed.response;

  const { lessonId } = await params;
  const body = parsed.data;
  const result =
    "positionSec" in body
      ? await recordVideoProgress(session.user.id, lessonId, body)
      : await recordLessonProgress(session.user.id, lessonId, !!body.completed);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}
