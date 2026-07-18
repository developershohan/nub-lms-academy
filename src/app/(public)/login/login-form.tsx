"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { loginAction, resendVerificationAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Logging in..." : "Log in"}
    </Button>
  );
}

function ResendVerificationButton({ email }: { email: string }) {
  const [sent, setSent] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full"
      disabled={sent}
      onClick={async () => {
        setSent(true);
        await resendVerificationAction(email);
        toast.success("Verification email sent - check your inbox.");
      }}
    >
      {sent ? "Verification email sent" : "Resend verification email"}
    </Button>
  );
}

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton />
      {state.unverifiedEmail && <ResendVerificationButton email={state.unverifiedEmail} />}
    </form>
  );
}
