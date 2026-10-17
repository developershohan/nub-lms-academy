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
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Redirecting to checkout..." : "Buy now"}
    </Button>
  );
}

/** `compact` drops the coupon field - for the phone price bar, where the full buy box (with the
 * coupon field) is still on the page. */
export function CheckoutButton({ courseId, compact = false }: { courseId: string; compact?: boolean }) {
  const [state, formAction] = useActionState(checkoutAction, initialState);
  const [showCoupon, setShowCoupon] = useState(false);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="courseId" value={courseId} />
      {showCoupon && <Input name="couponCode" placeholder="Coupon code" autoFocus />}
      <SubmitButton />
      {!compact && !showCoupon && (
        <button
          type="button"
          onClick={() => setShowCoupon(true)}
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Have a coupon?
        </button>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
