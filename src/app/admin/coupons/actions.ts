"use server";

import { auth } from "@/lib/auth";
import { couponSchema } from "@/lib/validations/coupon";
import { createCoupon, setCouponActive } from "@/server/services/coupon-service";

export type ActionState = { error?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function createCouponAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = couponSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await createCoupon(userId, parsed.data);
  return "error" in result ? { error: result.error } : {};
}

export async function deactivateCouponAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const couponId = formData.get("couponId") as string;
  const result = await setCouponActive(userId, couponId, false);
  return "error" in result ? { error: result.error } : {};
}

export async function activateCouponAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const couponId = formData.get("couponId") as string;
  const result = await setCouponActive(userId, couponId, true);
  return "error" in result ? { error: result.error } : {};
}
