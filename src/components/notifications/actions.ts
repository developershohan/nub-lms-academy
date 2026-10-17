"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@/lib/notification-categories";
import {
  markNotificationRead,
  markAllNotificationsRead,
  updateNotificationPreferences,
} from "@/server/services/notification-service";

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

export type PreferencesState = { error?: string };

/** One row per category in the form; unticked checkboxes are simply absent. */
export async function updateNotificationPreferencesAction(
  _prev: PreferencesState,
  formData: FormData
): Promise<PreferencesState> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not authenticated" };

  const known = new Set(Object.keys(NOTIFICATION_CATEGORIES));
  const categories = formData.getAll("category").map(String).filter((c): c is NotificationCategory => known.has(c));
  await updateNotificationPreferences(
    userId,
    categories.map((category) => ({
      category,
      inApp: formData.get(`inApp:${category}`) === "on",
      email: formData.get(`email:${category}`) === "on",
      push: formData.get(`push:${category}`) === "on",
    }))
  );
  revalidatePath("/notifications/preferences");
  return {};
}
