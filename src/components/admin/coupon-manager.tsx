"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionSuccess } from "@/hooks/use-action-success";
import { discountTypes } from "@/lib/validations/coupon";
import {
  createCouponAction,
  deactivateCouponAction,
  activateCouponAction,
  type ActionState,
} from "@/app/admin/coupons/actions";

const initialState: ActionState = {};
const DISCOUNT_ITEMS = { PERCENTAGE: "Percentage", FIXED_AMOUNT: "Fixed amount" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function CreateCouponForm({ courses }: { courses: { id: string; title: string }[] }) {
  const [state, formAction] = useActionState(createCouponAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useActionSuccess(state, initialState, () => {
    toast.success("Coupon created");
    formRef.current?.reset();
  });

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Code</Label>
        <Input name="code" placeholder="SAVE20" required />
      </div>
      <div className="space-y-1.5">
        <Label>Discount type</Label>
        <Select name="discountType" defaultValue="PERCENTAGE" items={DISCOUNT_ITEMS}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {discountTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {DISCOUNT_ITEMS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Discount value</Label>
        <Input name="discountValue" type="number" min={0} step="0.01" required />
      </div>
      <div className="space-y-1.5">
        <Label>Limit to one course (optional)</Label>
        <Select name="courseId" items={Object.fromEntries(courses.map((c) => [c.id, c.title]))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Max redemptions (blank = unlimited)</Label>
        <Input name="maxRedemptions" type="number" min={1} />
      </div>
      <div className="space-y-1.5">
        <Label>Per-user limit</Label>
        <Input name="perUserLimit" type="number" min={1} defaultValue={1} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Expires at (optional)</Label>
        <Input name="expiresAt" type="date" />
      </div>
      <div className="sm:col-span-2">
        {state.error && <p className="mb-2 text-sm text-destructive">{state.error}</p>}
        <SubmitButton label="Create coupon" pendingLabel="Creating..." />
      </div>
    </form>
  );
}

export function CouponStatusToggle({ couponId, active }: { couponId: string; active: boolean }) {
  const action = active ? deactivateCouponAction : activateCouponAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="couponId" value={couponId} />
      <SubmitButton
        label={active ? "Deactivate" : "Activate"}
        pendingLabel={active ? "Deactivating..." : "Activating..."}
      />
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
