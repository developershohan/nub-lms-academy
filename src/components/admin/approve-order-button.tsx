"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { approveOrderAction, type ActionState } from "@/app/admin/orders/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Approving..." : "Approve"}
    </Button>
  );
}

export function ApproveOrderButton({ orderId }: { orderId: string }) {
  const [state, formAction] = useActionState(approveOrderAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton />
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
