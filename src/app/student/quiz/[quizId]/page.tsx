import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, canAttemptQuiz } from "@/lib/permissions";
import {
  getQuizForTaking,
  getInProgressAttempt,
  listAttemptHistory,
} from "@/server/services/quiz-attempt-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StartQuizButton } from "@/components/learning/start-quiz-button";
import { QuizAttemptForm } from "@/components/learning/quiz-attempt-form";

export default async function QuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const quiz = await getQuizForTaking(user.id, quizId);
  if (!quiz) notFound();

  const inProgress = await getInProgressAttempt(user.id, quizId);
  if (inProgress) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold">{quiz.title}</h1>
          {quiz.description && <p className="text-muted-foreground">{quiz.description}</p>}
        </div>
        <QuizAttemptForm attemptId={inProgress.id} questions={quiz.questions} />
      </div>
    );
  }

  const [history, canAttempt] = await Promise.all([
    listAttemptHistory(user.id, quizId),
    canAttemptQuiz(user.id, quizId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{quiz.title}</CardTitle>
          {quiz.description && <CardDescription>{quiz.description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {quiz.questions.length} questions · Passing score {quiz.passingScore}%
            {quiz.maxAttempts != null && ` · Max ${quiz.maxAttempts} attempts`}
            {quiz.timeLimitSec != null && ` · Time limit ${Math.round(quiz.timeLimitSec / 60)} min`}
          </p>
          {canAttempt ? (
            <StartQuizButton quizId={quizId} label={history.length > 0 ? "Retake quiz" : "Start quiz"} />
          ) : (
            <p className="text-sm text-muted-foreground">You&apos;ve used all of your attempts for this quiz.</p>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Attempt history</h2>
          {history.map((attempt) => (
            <Card key={attempt.id}>
              <CardContent className="flex items-center justify-between pt-4">
                <span className="text-sm text-muted-foreground">
                  {attempt.submittedAt?.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={attempt.passed ? "secondary" : "outline"}>
                    {attempt.passed ? "Passed" : "Failed"} · {attempt.score}%
                  </Badge>
                  <Link href={`/student/quiz/${quizId}/attempts/${attempt.id}`} className="text-sm underline">
                    View details
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
