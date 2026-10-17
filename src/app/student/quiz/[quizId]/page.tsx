import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, Hourglass, ListChecks, RotateCcw, Target } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import {
  getAttemptEligibility,
  getInProgressAttempt,
  getQuizForTaking,
  listAttemptHistory,
} from "@/server/services/quiz-attempt-service";
import { Badge } from "@/components/ui/badge";
import { StartQuizButton } from "@/components/learning/start-quiz-button";
import { QuizAttemptForm } from "@/components/learning/quiz-attempt-form";

export const metadata = { title: "Quiz" };

function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

export default async function QuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const quiz = await getQuizForTaking(user.id, quizId);
  if (!quiz) notFound();

  const backToCourse = (
    <Link
      href={`/student/course/${quiz.course.id}/learn`}
      className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {quiz.course.title}
    </Link>
  );

  const inProgress = await getInProgressAttempt(user.id, quizId);
  if (inProgress) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        {backToCourse}
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{quiz.title}</h1>
          <p className="text-sm text-muted-foreground">
            Answers save as you go. Pass mark {quiz.passingScore}%.
          </p>
        </div>
        <QuizAttemptForm
          attemptId={inProgress.id}
          questions={inProgress.questions}
          saved={inProgress.saved}
          remainingMs={inProgress.remainingMs}
        />
      </div>
    );
  }

  const [history, eligibility] = await Promise.all([
    listAttemptHistory(user.id, quizId),
    getAttemptEligibility(user.id, quizId),
  ]);
  const best = history.reduce<number | null>((top, a) => Math.max(top ?? 0, a.score ?? 0), null);
  const passed = history.some((a) => a.passed);
  const block = eligibility?.block ?? null;

  const facts = [
    {
      icon: ListChecks,
      text:
        quiz.questionsPerAttempt < quiz.bankSize
          ? `${quiz.questionsPerAttempt} questions, drawn from ${quiz.bankSize}`
          : `${quiz.questionsPerAttempt} ${quiz.questionsPerAttempt === 1 ? "question" : "questions"}`,
    },
    { icon: Target, text: `Pass mark ${quiz.passingScore}%` },
    quiz.timeLimitSec ? { icon: Clock, text: `${minutesLabel(Math.max(1, Math.round(quiz.timeLimitSec / 60)))} time limit` } : null,
    {
      icon: RotateCcw,
      text:
        eligibility?.attemptsLeft == null
          ? "Unlimited attempts"
          : `${eligibility.attemptsLeft} of ${quiz.maxAttempts} ${quiz.maxAttempts === 1 ? "attempt" : "attempts"} left`,
    },
    quiz.retakeCooldownMin ? { icon: Hourglass, text: `${minutesLabel(quiz.retakeCooldownMin)} between attempts` } : null,
  ].filter((f) => f !== null);

  let blockedMessage: string | null = null;
  if (block?.reason === "cooldown") {
    blockedMessage = `You can try again in ${minutesLabel(eligibility?.cooldownMinutesLeft ?? 1)}.`;
  } else if (block?.reason === "no-attempts-left") {
    blockedMessage = "You've used all of your attempts for this quiz.";
  } else if (block?.reason === "no-questions") {
    blockedMessage = "This quiz has no questions yet.";
  } else if (block?.reason === "archived") {
    blockedMessage = "This quiz is no longer part of the course. Your past attempts are below.";
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      {backToCourse}
      <section className="space-y-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
        <div className="space-y-1.5">
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Quiz</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{quiz.title}</h1>
          {quiz.description && <p className="text-sm text-muted-foreground">{quiz.description}</p>}
        </div>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {facts.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
        {best != null && (
          <p className="text-sm">
            Best score <span className="font-semibold">{best}%</span>
            {passed && (
              <Badge className="ml-2 bg-primary text-primary-foreground" variant="default">
                Passed
              </Badge>
            )}
          </p>
        )}
        {blockedMessage ? (
          <p className="rounded-lg bg-muted p-3 text-sm">{blockedMessage}</p>
        ) : (
          <StartQuizButton quizId={quizId} label={history.length > 0 ? "Retake quiz" : "Start quiz"} />
        )}
      </section>

      {history.length > 0 && (
        <section aria-labelledby="history-heading" className="space-y-3">
          <h2 id="history-heading" className="font-heading text-lg font-semibold">
            Your attempts
          </h2>
          <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {history.map((attempt, i) => (
              <li key={attempt.id}>
                <Link
                  href={`/student/quiz/${quizId}/attempts/${attempt.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="font-medium">Attempt {history.length - i}</span>
                  <span className="text-muted-foreground">
                    {attempt.submittedAt?.toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </span>
                  {attempt.autoSubmitted && <Badge variant="outline">Time ran out</Badge>}
                  <span className="ml-auto flex items-center gap-2">
                    <span className="font-mono">{attempt.score}%</span>
                    <Badge variant={attempt.passed ? "default" : "outline"}>{attempt.passed ? "Passed" : "Not passed"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
