"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { subscribeAction, type ActionState } from "@/app/(public)/pricing/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Redirecting to checkout..." : "Subscribe"}
    </Button>
  );
}

export function SubscribeButton({ planId }: { planId: string }) {
  const [state, formAction] = useActionState(subscribeAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="planId" value={planId} />
      <SubmitButton />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
