import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listAttemptHistory, startQuizAttempt, submitQuizAttempt } from "@/server/services/quiz-attempt-service";

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
  answers: z.array(z.object({ questionId: z.string().min(1), selectedOptionIds: z.array(z.string()) })),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

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
