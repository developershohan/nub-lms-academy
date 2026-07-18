"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { assignUserToCourseAction, type ActionState } from "@/app/admin/messages/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Assigning..." : "Assign"}
    </Button>
  );
}

export function AssignToCourseForm({ courses }: { courses: { id: string; title: string }[] }) {
  const [state, formAction] = useActionState(assignUserToCourseAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success("User assigned to course.");
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assign a user to a course</CardTitle>
        <CardDescription>Manually enroll an existing account by email - works for students or teachers.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="atc-course">Course</Label>
              <select id="atc-course" name="courseId" required className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Select a course...</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="atc-email">User&apos;s email</Label>
              <Input id="atc-email" name="email" type="email" required />
            </div>
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
