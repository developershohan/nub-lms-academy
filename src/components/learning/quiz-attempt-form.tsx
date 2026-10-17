"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitQuizAttemptAction, type ActionState } from "@/app/student/quiz/[quizId]/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const initialState: ActionState = {};

type Option = { id: string; content: string };
type Question = {
  id: string;
  prompt: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  points: number;
  options: Option[];
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Submitting..." : "Submit quiz"}
    </Button>
  );
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/** Counts down from the server-computed time left and submits the form when it reaches zero - the
 * server rejects answers that arrive well past the deadline (see isAttemptExpired). */
function useQuizCountdown(remainingMs: number | null, formRef: React.RefObject<HTMLFormElement | null>) {
  const [left, setLeft] = useState(remainingMs);

  useEffect(() => {
    if (remainingMs == null) return;
    const endsAt = Date.now() + remainingMs;
    let submitted = false;
    const tick = () => {
      const msLeft = Math.max(0, endsAt - Date.now());
      setLeft(msLeft);
      if (msLeft === 0 && !submitted) {
        submitted = true;
        formRef.current?.requestSubmit();
      }
    };
    const interval = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(interval);
      clearTimeout(first);
    };
  }, [remainingMs, formRef]);

  return left;
}

export function QuizAttemptForm({
  attemptId,
  questions,
  remainingMs = null,
}: {
  attemptId: string;
  questions: Question[];
  /** Time left on the attempt, or null when the quiz has no time limit. */
  remainingMs?: number | null;
}) {
  const action = submitQuizAttemptAction.bind(null, attemptId);
  const [state, formAction] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const timeLeft = useQuizCountdown(remainingMs, formRef);

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      {timeLeft != null && (
        <p className="sticky top-2 z-10 w-fit rounded-md border bg-background px-3 py-1 text-sm font-medium">
          Time left {formatRemaining(timeLeft)}
        </p>
      )}
      {questions.map((question, index) => (
        <div key={question.id} className="space-y-3 rounded-md border p-4">
          <p className="font-medium">
            {index + 1}. {question.prompt}{" "}
            <span className="text-sm font-normal text-muted-foreground">({question.points} pt)</span>
          </p>
          {question.type === "MULTIPLE_CHOICE" ? (
            <div className="space-y-2">
              {question.options.map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm">
                  <Checkbox name={`q_${question.id}`} value={option.id} />
                  {option.content}
                </label>
              ))}
            </div>
          ) : (
            <RadioGroup name={`q_${question.id}`}>
              {question.options.map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={option.id} />
                  {option.content}
                </label>
              ))}
            </RadioGroup>
          )}
        </div>
      ))}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
