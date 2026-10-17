import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/http/json";
import { askQuestionSchema } from "@/lib/validations/chat";
import { getChatUser } from "@/server/chat/access";
import { askQuestion, listQuestions, type QuestionFilter } from "@/server/chat/qa";
import { notify } from "@/server/services/notification-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string }> };

/** Lesson Q&A for a course. ?lesson=<id>&q=<text>&unanswered=1&sort=top|new */
export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  const user = session?.user?.id ? await getChatUser(session.user.id) : null;
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { courseId } = await params;
  const search = new URL(request.url).searchParams;
  const filter: QuestionFilter = {
    lessonId: search.get("lesson") ?? undefined,
    q: search.get("q")?.slice(0, 100) ?? undefined,
    unanswered: search.get("unanswered") === "1",
    sort: search.get("sort") === "new" ? "new" : "top",
  };
  const result = await listQuestions(user, courseId, filter);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json(result);
}

/** Ask a question about a lesson of this course. */
export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  const user = session?.user?.id ? await getChatUser(session.user.id) : null;
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { courseId } = await params;
  const parsed = await parseJsonBody(request, askQuestionSchema);
  if ("response" in parsed) return parsed.response;
  const result = await askQuestion(notify, user, parsed.data.lessonId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error === "Forbidden" ? 403 : 400 });
  if (result.question.courseId !== courseId) return NextResponse.json({ error: "That lesson isn't in this course" }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
