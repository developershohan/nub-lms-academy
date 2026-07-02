"use server";

import { auth } from "@/lib/auth";
import { banUser, unbanUser } from "@/server/services/user-service";

export type ActionState = { error?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function banUserAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const actorId = await requireUserId();
  if (!actorId) return { error: "Not authenticated" };

  const userId = formData.get("userId") as string;
  const reason = (formData.get("reason") as string)?.trim();
  if (!reason) return { error: "A reason is required" };

  const result = await banUser(actorId, userId, reason);
  return "error" in result ? { error: result.error } : {};
}

export async function unbanUserAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const actorId = await requireUserId();
  if (!actorId) return { error: "Not authenticated" };

  const userId = formData.get("userId") as string;
  const result = await unbanUser(actorId, userId);
  return "error" in result ? { error: result.error } : {};
}
