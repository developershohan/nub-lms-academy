"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { startQuizAttemptAction, type ActionState } from "@/app/student/quiz/[quizId]/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Starting..." : label}
    </Button>
  );
}

export function StartQuizButton({ quizId, label }: { quizId: string; label: string }) {
  const action = startQuizAttemptAction.bind(null, quizId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <SubmitButton label={label} />
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
