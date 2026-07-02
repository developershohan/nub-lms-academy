"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { checkoutAction, type ActionState } from "@/app/(public)/courses/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Redirecting to checkout..." : "Buy course"}
    </Button>
  );
}

export function CheckoutButton({ courseId }: { courseId: string }) {
  const [state, formAction] = useActionState(checkoutAction, initialState);
  const [showCoupon, setShowCoupon] = useState(false);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="courseId" value={courseId} />
      {showCoupon ? (
        <Input name="couponCode" placeholder="Coupon code" />
      ) : (
        <button
          type="button"
          onClick={() => setShowCoupon(true)}
          className="text-sm text-muted-foreground underline"
        >
          Have a coupon?
        </button>
      )}
      <SubmitButton />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
