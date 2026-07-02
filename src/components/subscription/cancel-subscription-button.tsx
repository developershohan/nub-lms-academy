"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cancelSubscriptionAction, type ActionState } from "@/app/student/billing/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Cancelling..." : "Cancel subscription"}
    </Button>
  );
}

export function CancelSubscriptionButton() {
  const [state, formAction] = useActionState(cancelSubscriptionAction, initialState);

  return (
    <form action={formAction}>
      <SubmitButton />
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
