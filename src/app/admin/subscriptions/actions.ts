"use server";

import { auth } from "@/lib/auth";
import { subscriptionPlanSchema } from "@/lib/validations/subscription";
import { createPlan, setPlanActive } from "@/server/services/subscription-service";

export type ActionState = { error?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function createPlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const parsed = subscriptionPlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await createPlan(userId, parsed.data);
  return "error" in result ? { error: result.error } : {};
}

export async function activatePlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const planId = formData.get("planId") as string;
  const result = await setPlanActive(userId, planId, true);
  return "error" in result ? { error: result.error } : {};
}

export async function deactivatePlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const planId = formData.get("planId") as string;
  const result = await setPlanActive(userId, planId, false);
  return "error" in result ? { error: result.error } : {};
}
