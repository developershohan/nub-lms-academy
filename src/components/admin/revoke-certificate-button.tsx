"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { revokeCertificateAction, type ActionState } from "@/app/admin/certificates/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Revoking..." : "Revoke"}
    </Button>
  );
}

export function RevokeCertificateButton({ certificateId }: { certificateId: string }) {
  const [state, formAction] = useActionState(revokeCertificateAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="certificateId" value={certificateId} />
      <SubmitButton />
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
