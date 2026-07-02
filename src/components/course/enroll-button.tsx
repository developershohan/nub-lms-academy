"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { enrollAction, type ActionState } from "@/app/(public)/courses/[slug]/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Enrolling..." : "Enroll for free"}
    </Button>
  );
}

export function EnrollButton({ courseId }: { courseId: string }) {
  const [state, formAction] = useActionState(enrollAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="courseId" value={courseId} />
      <SubmitButton />
      {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
