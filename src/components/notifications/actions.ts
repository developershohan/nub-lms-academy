"use server";

import { auth } from "@/lib/auth";
import { markNotificationRead, markAllNotificationsRead } from "@/server/services/notification-service";

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function markNotificationReadAction(notificationId: string) {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" } as const;
  return markNotificationRead(userId, notificationId);
}

export async function markAllNotificationsReadAction() {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" } as const;
  return markAllNotificationsRead(userId);
}
