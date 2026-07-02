"use server";

import { auth } from "@/lib/auth";
import { refundOrder } from "@/server/services/order-service";

export type ActionState = { error?: string };

export async function refundOrderAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const orderId = formData.get("orderId") as string;
  const result = await refundOrder(session.user.id, orderId);
  return "error" in result ? { error: result.error } : {};
}
