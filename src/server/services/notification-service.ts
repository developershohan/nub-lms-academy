import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
};

/** Fire-and-forget from within another service's transaction path - callers don't await UI
 * revalidation here since the recipient isn't the one making the current request. */
export function createNotifications(notifications: NotificationInput[]) {
  return prisma.notification.createMany({ data: notifications });
}

export function listNotificationsForUser(userId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export function countUnreadNotifications(userId: string) {
  return prisma.notification.count({ where: { userId, status: "UNREAD" } });
}

/** Serialized props for the DashboardShell's NotificationBell - shared by the student, teacher,
 * and admin layouts so all three fetch/shape this identically. */
export async function getNotificationBellProps(userId: string) {
  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(userId),
    countUnreadNotifications(userId),
  ]);
  return {
    notifications: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      link: n.link,
      status: n.status,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  };
}

function revalidateNotificationPaths() {
  revalidatePath("/student/dashboard");
  revalidatePath("/teacher/dashboard");
  revalidatePath("/admin/dashboard");
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { status: "READ" },
  });
  if (result.count === 0) return { error: "Not found" } as const;
  revalidateNotificationPaths();
  return { ok: true } as const;
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, status: "UNREAD" }, data: { status: "READ" } });
  revalidateNotificationPaths();
  return { ok: true } as const;
}
