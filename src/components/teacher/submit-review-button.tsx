"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { submitForReviewAction, type ActionState } from "@/app/teacher/(dashboard)/courses/[courseId]/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      <Send aria-hidden />
      {pending ? "Submitting..." : "Submit for review"}
    </Button>
  );
}

/**
 * `ready` mirrors the publish checklist; the server checks the same rules again on submit. No success
 * toast: the page re-renders as "In review" and this button unmounts, which is the confirmation.
 */
export function SubmitReviewButton({ courseId, ready = true }: { courseId: string; ready?: boolean }) {
  const [state, formAction] = useActionState(submitForReviewAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1.5">
      <input type="hidden" name="courseId" value={courseId} />
      <SubmitButton disabled={!ready} />
      {!ready && <p className="text-xs text-muted-foreground">Finish the required steps to submit.</p>}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
