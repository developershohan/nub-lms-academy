"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resetPasswordAction, type ResetPasswordState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ResetPasswordState = {};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      {pending ? "Updating..." : "Update password"}
    </Button>
  );
}

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success("Password updated. Please log in.");
      router.push("/login");
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" required minLength={8} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton disabled={!token || !email} />
    </form>
  );
}
