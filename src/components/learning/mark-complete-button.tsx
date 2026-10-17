"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { markLessonCompleteAction, type ActionState } from "@/app/student/course/[courseId]/learn/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full px-4 sm:w-auto">
      <Check aria-hidden />
      {pending ? "Saving..." : label}
    </Button>
  );
}

/** Marks the lesson done; the action then opens the next lesson (see markLessonCompleteAction). */
export function MarkCompleteButton({
  lessonId,
  watchedSeconds,
  label = "Mark as complete",
}: {
  lessonId: string;
  watchedSeconds: number;
  label?: string;
}) {
  const [state, formAction] = useActionState(markLessonCompleteAction, initialState);

  return (
    <form action={formAction} className="w-full sm:w-auto">
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="watchedSeconds" value={watchedSeconds} />
      <SubmitButton label={label} />
      {state.error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
