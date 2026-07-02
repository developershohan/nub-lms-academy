"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { hideReviewAction, unhideReviewAction, deleteReviewAction, type ActionState } from "@/app/admin/reviews/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function ActionButton({ label, pendingLabel, variant }: { label: string; pendingLabel: string; variant?: "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function ReviewModerationActions({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const [hideState, hideAction] = useActionState(hideReviewAction, initialState);
  const [unhideState, unhideAction] = useActionState(unhideReviewAction, initialState);
  const [deleteState, deleteFormAction] = useActionState(deleteReviewAction, initialState);
  const error = hideState.error ?? unhideState.error ?? deleteState.error;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {hidden ? (
          <form action={unhideAction}>
            <input type="hidden" name="reviewId" value={reviewId} />
            <ActionButton label="Unhide" pendingLabel="Unhiding..." />
          </form>
        ) : (
          <form action={hideAction}>
            <input type="hidden" name="reviewId" value={reviewId} />
            <ActionButton label="Hide" pendingLabel="Hiding..." variant="outline" />
          </form>
        )}
        <form action={deleteFormAction}>
          <input type="hidden" name="reviewId" value={reviewId} />
          <ActionButton label="Delete" pendingLabel="Deleting..." variant="outline" />
        </form>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
