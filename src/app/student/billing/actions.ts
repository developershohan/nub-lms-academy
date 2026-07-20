"use server";

import { auth } from "@/lib/auth";
import { cancelSubscription } from "@/server/services/subscription-service";

export type ActionState = { error?: string };

export async function cancelSubscriptionAction(): Promise<ActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Not authenticated" };

  const result = await cancelSubscription(userId);
  return "error" in result ? { error: result.error } : {};
}
