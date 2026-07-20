"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { enrollStudentAction, type ActionState } from "@/app/teacher/(dashboard)/messages/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Enrolling..." : "Enroll"}
    </Button>
  );
}

export function ManualEnrollForm({ courseId }: { courseId: string }) {
  const [state, formAction] = useActionState(enrollStudentAction.bind(null, courseId), initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success("Student enrolled.");
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enroll a student</CardTitle>
        <CardDescription>Manually add an existing account to this course by email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex gap-2">
          <Input name="email" type="email" placeholder="Student's email" required className="flex-1" />
          <SubmitButton />
        </form>
        {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      </CardContent>
    </Card>
  );
}
