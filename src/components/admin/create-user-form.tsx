"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { createUserAction, type ActionState } from "@/app/admin/messages/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create account"}
    </Button>
  );
}

export function CreateUserForm() {
  const [state, formAction] = useActionState(createUserAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success("Account created.");
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create a user</CardTitle>
        <CardDescription>Sets an initial password directly - no invite email is sent.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cu-name">Name</Label>
              <Input id="cu-name" name="name" required minLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-email">Email</Label>
              <Input id="cu-email" name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-password">Initial password</Label>
              <Input id="cu-password" name="password" type="password" required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-role">Role</Label>
              <select id="cu-role" name="role" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="STUDENT">Student</option>
                <option value="TEACHER">Teacher</option>
                <option value="SUPPORT">Support</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="cu-autoverify" name="autoVerify" defaultChecked className="size-4" />
            <Label htmlFor="cu-autoverify" className="text-sm font-normal">
              Mark email as verified (skip - they won&apos;t need to verify it themselves). Unchecked sends them
              the normal verification email instead.
            </Label>
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
