"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toggleWishlistAction, type ActionState } from "@/app/(public)/courses/[slug]/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

function SubmitButton({ wishlisted }: { wishlisted: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      {pending ? "Saving..." : wishlisted ? "Remove from wishlist" : "Add to wishlist"}
    </Button>
  );
}

export function WishlistButton({
  courseId,
  slug,
  wishlisted,
}: {
  courseId: string;
  slug: string;
  wishlisted: boolean;
}) {
  const [state, formAction] = useActionState(toggleWishlistAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="slug" value={slug} />
      <SubmitButton wishlisted={wishlisted} />
      {state.error && <p className="mt-1 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
