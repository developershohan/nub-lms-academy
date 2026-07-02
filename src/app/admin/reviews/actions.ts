"use server";

import { auth } from "@/lib/auth";
import { setReviewHidden, deleteReview } from "@/server/services/review-service";

export type ActionState = { error?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function hideReviewAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const reviewId = formData.get("reviewId") as string;
  const result = await setReviewHidden(userId, reviewId, true);
  return "error" in result ? { error: result.error } : {};
}

export async function unhideReviewAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const reviewId = formData.get("reviewId") as string;
  const result = await setReviewHidden(userId, reviewId, false);
  return "error" in result ? { error: result.error } : {};
}

export async function deleteReviewAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const reviewId = formData.get("reviewId") as string;
  const result = await deleteReview(userId, reviewId);
  return "error" in result ? { error: result.error } : {};
}
