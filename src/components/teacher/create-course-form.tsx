"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createCourseAction, type CreateCourseState } from "@/app/teacher/(dashboard)/courses/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CreateCourseState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating..." : "Create course"}
    </Button>
  );
}

export function CreateCourseForm() {
  const [state, formAction] = useActionState(createCourseAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Course title</Label>
        <Input id="title" name="title" placeholder="e.g. Complete Next.js Bootcamp" required />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
