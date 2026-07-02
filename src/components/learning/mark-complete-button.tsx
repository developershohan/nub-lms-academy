"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { markLessonCompleteAction, type ActionState } from "@/app/student/course/[courseId]/learn/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton({ completed }: { completed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || completed} variant={completed ? "outline" : "default"}>
      {completed ? "Completed" : pending ? "Saving..." : "Mark as complete"}
    </Button>
  );
}

export function MarkCompleteButton({
  lessonId,
  watchedSeconds,
  completed,
}: {
  lessonId: string;
  watchedSeconds: number;
  completed: boolean;
}) {
  const [state, formAction] = useActionState(markLessonCompleteAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="watchedSeconds" value={watchedSeconds} />
      <SubmitButton completed={completed} />
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
