"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  approveCourseAction,
  rejectCourseAction,
  publishCourseAction,
  unpublishCourseAction,
  includeInSubscriptionAction,
  excludeFromSubscriptionAction,
  featureCourseAction,
  unfeatureCourseAction,
  type ActionState,
} from "@/app/admin/courses/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionState = {};

function ActionButton({ label, pendingLabel, variant }: { label: string; pendingLabel: string; variant?: "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function CourseReviewActions({
  courseId,
  status,
  isSubscriptionIncluded,
  isFeatured = false,
}: {
  courseId: string;
  status: string;
  isSubscriptionIncluded: boolean;
  isFeatured?: boolean;
}) {
  const [approveState, approveAction] = useActionState(approveCourseAction, initialState);
  const [rejectState, rejectAction] = useActionState(rejectCourseAction, initialState);
  const [publishState, publishAction] = useActionState(publishCourseAction, initialState);
  const [unpublishState, unpublishAction] = useActionState(unpublishCourseAction, initialState);
  const [subscriptionState, subscriptionAction] = useActionState(
    isSubscriptionIncluded ? excludeFromSubscriptionAction : includeInSubscriptionAction,
    initialState
  );
  const [featuredState, featuredAction] = useActionState(
    isFeatured ? unfeatureCourseAction : featureCourseAction,
    initialState
  );
  const [showReject, setShowReject] = useState(false);

  const error =
    approveState.error ??
    rejectState.error ??
    publishState.error ??
    unpublishState.error ??
    subscriptionState.error ??
    featuredState.error;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status === "IN_REVIEW" && (
          <>
            <form action={approveAction}>
              <input type="hidden" name="courseId" value={courseId} />
              <ActionButton label="Approve" pendingLabel="Approving..." />
            </form>
            <Button size="sm" variant="outline" onClick={() => setShowReject((v) => !v)}>
              Reject
            </Button>
          </>
        )}
        {status === "APPROVED" && (
          <form action={publishAction}>
            <input type="hidden" name="courseId" value={courseId} />
            <ActionButton label="Publish" pendingLabel="Publishing..." />
          </form>
        )}
        {status === "PUBLISHED" && (
          <>
            <form action={unpublishAction}>
              <input type="hidden" name="courseId" value={courseId} />
              <ActionButton label="Unpublish" pendingLabel="Unpublishing..." variant="outline" />
            </form>
            <form action={featuredAction}>
              <input type="hidden" name="courseId" value={courseId} />
              <ActionButton
                label={isFeatured ? "Remove from home" : "Feature on home"}
                pendingLabel="Saving..."
                variant="outline"
              />
            </form>
          </>
        )}
        <form action={subscriptionAction}>
          <input type="hidden" name="courseId" value={courseId} />
          <ActionButton
            label={isSubscriptionIncluded ? "Remove from subscription" : "Include in subscription"}
            pendingLabel="Saving..."
            variant="outline"
          />
        </form>
      </div>
      {showReject && (
        <form action={rejectAction} className="flex w-64 flex-col items-end gap-2">
          <input type="hidden" name="courseId" value={courseId} />
          <Textarea name="reason" placeholder="Reason for rejection" required rows={2} />
          <ActionButton label="Confirm reject" pendingLabel="Rejecting..." variant="outline" />
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
