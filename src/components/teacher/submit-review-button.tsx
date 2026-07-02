"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitForReviewAction, type ActionState } from "@/app/teacher/(dashboard)/courses/[courseId]/edit/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Submitting..." : "Submit for review"}
    </Button>
  );
}

export function SubmitReviewButton({ courseId }: { courseId: string }) {
  const [state, formAction] = useActionState(submitForReviewAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="courseId" value={courseId} />
      <SubmitButton />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
