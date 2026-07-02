"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitReviewAction, type ActionState } from "@/app/(public)/courses/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Submit review"}
    </Button>
  );
}

export function ReviewForm({
  courseId,
  slug,
  existing,
}: {
  courseId: string;
  slug: string;
  existing?: { rating: number; comment: string | null };
}) {
  const [state, formAction] = useActionState(submitReviewAction, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-md border p-4">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="space-y-1.5">
        <Label>Rating</Label>
        <Select
          name="rating"
          defaultValue={existing ? String(existing.rating) : "5"}
          items={Object.fromEntries([5, 4, 3, 2, 1].map((n) => [String(n), `${n} stars`]))}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[5, 4, 3, 2, 1].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} stars
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Comment</Label>
        <Textarea name="comment" defaultValue={existing?.comment ?? ""} rows={3} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
