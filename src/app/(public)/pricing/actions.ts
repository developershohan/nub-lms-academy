"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createSubscriptionCheckoutSession } from "@/server/services/subscription-service";

export type ActionState = { error?: string };

export async function subscribeAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Not authenticated" };

  const planId = formData.get("planId") as string;
  const result = await createSubscriptionCheckoutSession(userId, planId);
  if ("error" in result) return { error: result.error };

  redirect(result.checkoutUrl);
}
