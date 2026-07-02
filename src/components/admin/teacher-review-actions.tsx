"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { approveTeacherAction, rejectTeacherAction, type ReviewState } from "@/app/admin/teachers/actions";
import { Button } from "@/components/ui/button";

const initialState: ReviewState = {};

function ReviewButton({ label, variant }: { label: string; variant?: "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {label}
    </Button>
  );
}

export function TeacherReviewActions({ teacherId }: { teacherId: string }) {
  const [approveState, approveFormAction] = useActionState(approveTeacherAction, initialState);
  const [rejectState, rejectFormAction] = useActionState(rejectTeacherAction, initialState);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <form action={approveFormAction}>
          <input type="hidden" name="teacherId" value={teacherId} />
          <ReviewButton label="Approve" />
        </form>
        <form action={rejectFormAction}>
          <input type="hidden" name="teacherId" value={teacherId} />
          <ReviewButton label="Reject" variant="outline" />
        </form>
      </div>
      {(approveState.error || rejectState.error) && (
        <p className="text-sm text-destructive">{approveState.error ?? rejectState.error}</p>
      )}
    </div>
  );
}
