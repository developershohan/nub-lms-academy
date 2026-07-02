"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { generateCertificateAction, type ActionState } from "@/app/student/certificates/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Generating..." : "Get certificate"}
    </Button>
  );
}

export function GenerateCertificateButton({ courseId }: { courseId: string }) {
  const [state, formAction] = useActionState(generateCertificateAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="courseId" value={courseId} />
      <SubmitButton />
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
