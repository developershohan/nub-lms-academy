import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getAttemptResult } from "@/server/services/quiz-attempt-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function QuizAttemptResultPage({
  params,
}: {
  params: Promise<{ quizId: string; attemptId: string }>;
}) {
  const { quizId, attemptId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const attempt = await getAttemptResult(user.id, attemptId);
  if (!attempt || attempt.status !== "SUBMITTED") notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{attempt.quiz.title}</h1>
        <Badge variant={attempt.passed ? "secondary" : "outline"}>
          {attempt.passed ? "Passed" : "Failed"} · {attempt.score}%
        </Badge>
      </div>

      <div className="space-y-3">
        {attempt.answers.map((answer, index) => (
          <Card key={answer.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {index + 1}. {answer.question.prompt}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {answer.question.options.map((option) => {
                const wasSelected = answer.selectedOptionIds.includes(option.id);
                return (
                  <div
                    key={option.id}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-1.5 text-sm",
                      option.isCorrect && "border-green-600 bg-green-50 dark:bg-green-950",
                      wasSelected && !option.isCorrect && "border-destructive bg-destructive/10"
                    )}
                  >
                    <span>{option.content}</span>
                    <span className="text-xs text-muted-foreground">
                      {wasSelected && "Your answer"}
                      {option.isCorrect && (wasSelected ? " · Correct" : "Correct answer")}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Link href={`/student/quiz/${quizId}`} className="text-sm underline">
        Back to quiz
      </Link>
    </div>
  );
}
