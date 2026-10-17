"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Clock, CloudOff, Loader2 } from "lucide-react";
import {
  saveQuizAnswersAction,
  submitQuizAttemptAction,
  type ActionState,
} from "@/app/student/quiz/[quizId]/actions";
import type { PublicQuestion, QuestionResponse } from "@/lib/quiz-grading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};
const AUTOSAVE_DELAY_MS = 800;

const TYPE_HINTS: Record<PublicQuestion["type"], string> = {
  SINGLE_CHOICE: "Choose one answer",
  TRUE_FALSE: "True or false",
  MULTIPLE_CHOICE: "Select all that apply",
  FILL_BLANK: "Type your answer",
  ORDERING: "Put these in the right order",
};

function formatRemaining(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Counts down from the server-computed time left and submits the form at zero. The server
 * enforces the same deadline: anything arriving later is ignored and saved answers are graded. */
function useQuizCountdown(remainingMs: number | null, onExpire: () => void) {
  const [left, setLeft] = useState(remainingMs);
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  });

  useEffect(() => {
    if (remainingMs == null) return;
    const endsAt = Date.now() + remainingMs;
    let fired = false;
    const tick = () => {
      const msLeft = Math.max(0, endsAt - Date.now());
      setLeft(msLeft);
      if (msLeft === 0 && !fired) {
        fired = true;
        expire.current();
      }
    };
    const interval = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(interval);
      clearTimeout(first);
    };
  }, [remainingMs]);

  return left;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Submitting..." : "Submit answers"}
    </Button>
  );
}

function ChoiceOptions({ question, saved }: { question: PublicQuestion; saved?: QuestionResponse }) {
  const multiple = question.type === "MULTIPLE_CHOICE";
  return (
    <div className="space-y-2" role={multiple ? "group" : "radiogroup"} aria-labelledby={`prompt-${question.id}`}>
      {question.options.map((option) => (
        <label
          key={option.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/60 has-checked:border-primary has-checked:bg-primary/5"
        >
          <input
            type={multiple ? "checkbox" : "radio"}
            name={`q_${question.id}`}
            value={option.id}
            defaultChecked={saved?.selectedOptionIds.includes(option.id)}
            className="size-4 shrink-0 accent-primary"
          />
          {option.content}
        </label>
      ))}
    </div>
  );
}

/** Up/down buttons rather than drag and drop: works with a keyboard and on a phone. */
function OrderingInput({
  question,
  saved,
  onMove,
}: {
  question: PublicQuestion;
  saved?: QuestionResponse;
  onMove: () => void;
}) {
  const content = new Map(question.options.map((o) => [o.id, o.content]));
  const [order, setOrder] = useState(() => {
    const ids = saved?.selectedOptionIds ?? [];
    return ids.length === question.options.length && ids.every((id) => content.has(id))
      ? ids
      : question.options.map((o) => o.id);
  });

  function move(index: number, by: -1 | 1) {
    setOrder((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
    onMove();
  }

  return (
    <ol className="space-y-2" aria-labelledby={`prompt-${question.id}`}>
      {order.map((id, index) => (
        <li key={id} className="flex items-center gap-2 rounded-lg border bg-background py-1.5 pr-1.5 pl-3 text-sm">
          <input type="hidden" name={`q_${question.id}`} value={id} />
          <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{index + 1}</span>
          <span className="min-w-0 flex-1">{content.get(id)}</span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Move "${content.get(id)}" up`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Move "${content.get(id)}" down`}
            disabled={index === order.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown aria-hidden />
          </Button>
        </li>
      ))}
    </ol>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "failed";

export function QuizAttemptForm({
  attemptId,
  questions,
  saved,
  remainingMs = null,
}: {
  attemptId: string;
  questions: PublicQuestion[];
  /** Answers already saved for this attempt, by question id - restored after a reload. */
  saved: Record<string, QuestionResponse>;
  /** Time left on the attempt, or null when the quiz has no time limit. */
  remainingMs?: number | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(submitQuizAttemptAction.bind(null, attemptId), initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitting = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [answered, setAnswered] = useState(() => new Set(Object.keys(saved)));

  const countAnswered = useCallback(() => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    setAnswered((touched) => {
      const next = new Set<string>();
      for (const q of questions) {
        const values = data.getAll(`q_${q.id}`).map(String).filter(Boolean);
        // An ordering always has an order; it counts once the student has moved something.
        if (q.type === "ORDERING" ? touched.has(q.id) : values.length > 0) next.add(q.id);
      }
      return next;
    });
  }, [questions]);

  const save = useCallback(async () => {
    if (!formRef.current || autoSubmitting.current) return;
    setSaveStatus("saving");
    const result = await saveQuizAnswersAction(attemptId, new FormData(formRef.current));
    if (result.expired) {
      // The server already graded the saved answers; reload to show where things stand.
      router.refresh();
      return;
    }
    setSaveStatus(result.ok ? "saved" : "failed");
  }, [attemptId, router]);

  const scheduleSave = useCallback(() => {
    countAnswered();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, AUTOSAVE_DELAY_MS);
  }, [countAnswered, save]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const timeLeft = useQuizCountdown(remainingMs, () => {
    autoSubmitting.current = true;
    clearTimeout(saveTimer.current);
    formRef.current?.requestSubmit();
  });

  const unanswered = questions.length - answered.size;

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={scheduleSave}
      onSubmit={(event) => {
        if (autoSubmitting.current || unanswered === 0) return;
        const noun = unanswered === 1 ? "question is" : "questions are";
        if (!window.confirm(`${unanswered} ${noun} still unanswered. Submit anyway?`)) event.preventDefault();
      }}
      className="space-y-5"
    >
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-background/95 px-4 py-2.5 text-sm backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        {timeLeft != null && (
          <span
            role="timer"
            aria-live={timeLeft < 60_000 ? "polite" : "off"}
            className={cn(
              "inline-flex items-center gap-1.5 font-mono font-medium",
              timeLeft < 60_000 && "text-amber-foreground dark:text-amber",
              timeLeft < 10_000 && "text-destructive"
            )}
          >
            <Clock className="size-4" aria-hidden />
            {formatRemaining(timeLeft)}
            <span className="sr-only">left</span>
          </span>
        )}
        <span className="text-muted-foreground">
          {answered.size} of {questions.length} answered
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          {saveStatus === "saving" && (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <Check className="size-3.5" aria-hidden /> Answers saved
            </>
          )}
          {saveStatus === "failed" && (
            <>
              <CloudOff className="size-3.5 text-destructive" aria-hidden /> Not saved - check your connection
            </>
          )}
        </span>
      </div>

      <ol className="space-y-4">
        {questions.map((question, index) => (
          <li key={question.id} className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                Question {index + 1}
                <span aria-hidden>·</span>
                {question.points} {question.points === 1 ? "point" : "points"}
              </p>
              <p id={`prompt-${question.id}`} className="font-medium whitespace-pre-line">
                {question.prompt}
              </p>
              <p className="text-xs text-muted-foreground">{TYPE_HINTS[question.type]}</p>
            </div>
            {question.type === "FILL_BLANK" ? (
              <Input
                name={`q_${question.id}`}
                defaultValue={saved[question.id]?.textAnswer ?? ""}
                maxLength={500}
                autoComplete="off"
                aria-labelledby={`prompt-${question.id}`}
                className="max-w-sm"
              />
            ) : question.type === "ORDERING" ? (
              <OrderingInput
                question={question}
                saved={saved[question.id]}
                onMove={() => {
                  setAnswered((current) => new Set(current).add(question.id));
                  scheduleSave();
                }}
              />
            ) : (
              <ChoiceOptions question={question} saved={saved[question.id]} />
            )}
          </li>
        ))}
      </ol>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        {unanswered > 0 && (
          <p className="text-sm text-muted-foreground">
            {unanswered} {unanswered === 1 ? "question" : "questions"} unanswered
          </p>
        )}
      </div>
    </form>
  );
}
