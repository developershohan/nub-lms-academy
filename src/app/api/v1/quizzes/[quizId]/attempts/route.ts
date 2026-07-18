import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listAttemptHistory, startQuizAttempt, submitQuizAttempt } from "@/server/services/quiz-attempt-service";
import { parseJsonBody } from "@/lib/http/json";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { quizId } = await params;
  const attempts = await listAttemptHistory(session.user.id, quizId);
  return NextResponse.json({ attempts });
}

export async function POST(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { quizId } = await params;
  const result = await startQuizAttempt(session.user.id, quizId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ attemptId: result.attemptId }, { status: 201 });
}

const submitSchema = z.object({
  attemptId: z.string().min(1),
  answers: z
    .array(z.object({ questionId: z.string().min(1), selectedOptionIds: z.array(z.string()).max(20) }))
    .max(200),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = await parseJsonBody(request, submitSchema);
  if ("response" in parsed) return parsed.response;

  const formData = new FormData();
  for (const answer of parsed.data.answers) {
    for (const optionId of answer.selectedOptionIds) {
      formData.append(`q_${answer.questionId}`, optionId);
    }
  }

  const result = await submitQuizAttempt(session.user.id, parsed.data.attemptId, formData);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
