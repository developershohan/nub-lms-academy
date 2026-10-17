import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { getAttemptResult, type AttemptResult } from "@/server/services/quiz-attempt-service";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata = { title: "Quiz result" };

type ReviewQuestion = AttemptResult["questions"][number];

const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

function ChoiceReview({ question }: { question: ReviewQuestion }) {
  const key = question.answerKey;
  return (
    <ul className="space-y-1.5">
      {question.options.map((option) => {
        const chosen = question.selectedOptionIds.includes(option.id);
        const correct = key?.correctOptionIds.includes(option.id) ?? false;
        return (
          <li
            key={option.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
              !key && chosen && "border-primary bg-primary/5",
              key && correct && "border-primary bg-primary/10",
              key && chosen && !correct && "border-destructive bg-destructive/10"
            )}
          >
            <span>{option.content}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {[chosen && "Your answer", key && correct && "Correct answer"].filter(Boolean).join(" · ")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function OrderingReview({ question }: { question: ReviewQuestion }) {
  const content = new Map(question.options.map((o) => [o.id, o.content]));
  const given = question.selectedOptionIds.length ? question.selectedOptionIds : question.options.map((o) => o.id);
  const correct = question.answerKey?.correctOrder;
  return (
    <div className={cn("grid gap-4", correct && "sm:grid-cols-2")}>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Your order</p>
        <ol className="space-y-1.5">
          {given.map((id, i) => (
            <li
              key={id}
              className={cn(
                "flex gap-2 rounded-lg border px-3 py-2 text-sm",
                correct && (correct[i] === id ? "border-primary bg-primary/10" : "border-destructive bg-destructive/10")
              )}
            >
              <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
              {content.get(id)}
            </li>
          ))}
        </ol>
      </div>
      {correct && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Correct order</p>
          <ol className="space-y-1.5">
            {correct.map((id, i) => (
              <li key={id} className="flex gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                {content.get(id)}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function BlankReview({ question }: { question: ReviewQuestion }) {
  const accepted = question.answerKey?.acceptedAnswers;
  return (
    <div className="space-y-1.5 text-sm">
      <p>
        Your answer:{" "}
        <span className={cn("font-medium", !question.textAnswer && "text-muted-foreground")}>
          {question.textAnswer || "No answer"}
        </span>
      </p>
      {accepted && <p className="text-muted-foreground">Accepted: {accepted.join(", ")}</p>}
    </div>
  );
}

export default async function QuizAttemptResultPage({
  params,
}: {
  params: Promise<{ quizId: string; attemptId: string }>;
}) {
  const { quizId, attemptId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await getAttemptResult(user.id, attemptId);
  if (!result || result.quizId !== quizId) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <Link
        href={`/student/quiz/${quizId}`}
        className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to quiz
      </Link>

      <section className="space-y-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Result</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{result.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-heading text-4xl font-semibold">{result.score}%</span>
          <Badge variant={result.passed ? "default" : "outline"}>{result.passed ? "Passed" : "Not passed"}</Badge>
          <span className="text-sm text-muted-foreground">
            Pass mark {result.passingScore}%
            {result.pointsPossible != null &&
              ` · ${pts(result.pointsEarned ?? 0)} of ${pts(result.pointsPossible)} points`}
          </span>
        </div>
        {result.autoSubmitted && (
          <p className="text-sm text-muted-foreground">Time ran out, so the answers you had saved were submitted.</p>
        )}
        {!result.revealAnswers && (
          <p className="rounded-lg bg-muted p-3 text-sm">
            Correct answers are shown once you pass this quiz or use your last attempt.
          </p>
        )}
      </section>

      <ol className="space-y-4">
        {result.questions.map((question, index) => (
          <li key={question.id} className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Question {index + 1}</p>
                <p className="font-medium whitespace-pre-line">{question.prompt}</p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 font-mono text-xs",
                  question.isCorrect ? "text-primary" : question.pointsAwarded > 0 ? "text-amber-foreground dark:text-amber" : "text-muted-foreground"
                )}
              >
                {question.isCorrect ? <Check className="size-3.5" aria-hidden /> : question.pointsAwarded === 0 && <X className="size-3.5" aria-hidden />}
                {pts(question.pointsAwarded)}/{question.points} pt
              </span>
            </div>
            {question.type === "FILL_BLANK" ? (
              <BlankReview question={question} />
            ) : question.type === "ORDERING" ? (
              <OrderingReview question={question} />
            ) : (
              <ChoiceReview question={question} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
