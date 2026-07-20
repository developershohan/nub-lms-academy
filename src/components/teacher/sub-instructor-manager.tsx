"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  addSubInstructorAction,
  removeSubInstructorAction,
  type ActionState,
} from "@/app/teacher/(dashboard)/messages/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Adding..." : "Add"}
    </Button>
  );
}

export function SubInstructorManager({
  courseId,
  initialInstructors,
}: {
  courseId: string;
  initialInstructors: { user: { id: string; name: string | null; email: string } }[];
}) {
  const [instructors, setInstructors] = useState(initialInstructors);
  const [state, formAction] = useActionState(addSubInstructorAction.bind(null, courseId), initialState);

  useEffect(() => {
    if (state.success) toast.success("Sub-instructor added.");
  }, [state.success]);

  async function handleRemove(userId: string) {
    const result = await removeSubInstructorAction(courseId, userId);
    if ("error" in result) return toast.error(result.error);
    setInstructors((prev) => prev.filter((i) => i.user.id !== userId));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sub-instructors</CardTitle>
        <CardDescription>Teachers who can chat with students on this course (no content-edit access).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {instructors.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {instructors.map((i) => (
          <div key={i.user.id} className="flex items-center justify-between text-sm">
            <span>{i.user.name ?? i.user.email}</span>
            <Button variant="ghost" size="sm" onClick={() => handleRemove(i.user.id)}>
              Remove
            </Button>
          </div>
        ))}
        <form action={formAction} className="flex gap-2">
          <Input name="email" type="email" placeholder="Teacher's email" required className="flex-1" />
          <SubmitButton />
        </form>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </CardContent>
    </Card>
  );
}
