"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { applyTeacherAction, type ApplyTeacherState } from "@/app/teacher/apply/actions";
import { Button } from "@/components/ui/button";

const initialState: ApplyTeacherState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Submitting..." : "Apply to become a teacher"}
    </Button>
  );
}

export function ApplyButton() {
  const [state, formAction] = useActionState(applyTeacherAction, initialState);

  return (
    <form action={formAction}>
      <SubmitButton />
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
