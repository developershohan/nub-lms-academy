"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { reviewSchema } from "@/lib/validations/learning";
import { enrollInFreeCourse } from "@/server/services/enrollment-service";
import { toggleWishlist } from "@/server/services/wishlist-service";
import { submitReview } from "@/server/services/review-service";
import { createCheckoutSession } from "@/server/services/order-service";

export type ActionState = { error?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function enrollAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const result = await enrollInFreeCourse(userId, courseId);
  return "error" in result ? { error: result.error } : {};
}

export async function toggleWishlistAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const slug = formData.get("slug") as string;
  await toggleWishlist(userId, courseId, slug);
  return {};
}

export async function submitReviewAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const courseId = formData.get("courseId") as string;
  const slug = formData.get("slug") as string;
  const result = await submitReview(userId, courseId, slug, parsed.data.rating, parsed.data.comment);
  return "error" in result ? { error: result.error } : {};
}

export async function checkoutAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const courseId = formData.get("courseId") as string;
  const couponCode = (formData.get("couponCode") as string) || undefined;
  const result = await createCheckoutSession(userId, courseId, couponCode);
  if ("error" in result) return { error: result.error };

  redirect(result.freeViaCoupon ? "/student/my-courses" : result.checkoutUrl);
}
