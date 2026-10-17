import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInProgressAttempt, getQuizForTaking } from "@/server/services/quiz-attempt-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { quizId } = await params;
  const quiz = await getQuizForTaking(session.user.id, quizId);
  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Questions belong to an attempt (drawn and shuffled when it starts), so they come with the open one.
  const attempt = await getInProgressAttempt(session.user.id, quizId);
  return NextResponse.json({ quiz, attempt });
}
