"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionSuccess } from "@/hooks/use-action-success";
import { subscriptionIntervals } from "@/lib/validations/subscription";
import {
  createPlanAction,
  deactivatePlanAction,
  activatePlanAction,
  type ActionState,
} from "@/app/admin/subscriptions/actions";

const initialState: ActionState = {};
const INTERVAL_ITEMS = { MONTH: "Monthly", YEAR: "Yearly" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function CreatePlanForm() {
  const [state, formAction] = useActionState(createPlanAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useActionSuccess(state, initialState, () => {
    toast.success("Plan created");
    formRef.current?.reset();
  });

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input name="name" placeholder="Pro" required />
      </div>
      <div className="space-y-1.5">
        <Label>Interval</Label>
        <Select name="interval" defaultValue="MONTH" items={INTERVAL_ITEMS}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {subscriptionIntervals.map((i) => (
              <SelectItem key={i} value={i}>
                {INTERVAL_ITEMS[i]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Price (USD)</Label>
        <Input name="price" type="number" min={0} step="0.01" required />
      </div>
      <div className="sm:col-span-3">
        {state.error && <p className="mb-2 text-sm text-destructive">{state.error}</p>}
        <SubmitButton label="Create plan" pendingLabel="Creating..." />
      </div>
    </form>
  );
}

export function PlanStatusToggle({ planId, active }: { planId: string; active: boolean }) {
  const action = active ? deactivatePlanAction : activatePlanAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="planId" value={planId} />
      <SubmitButton
        label={active ? "Deactivate" : "Activate"}
        pendingLabel={active ? "Deactivating..." : "Activating..."}
      />
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
