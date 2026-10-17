import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";

export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
};

/** Fire-and-forget from within another service's transaction path - callers don't await UI
 * revalidation here since the recipient isn't the one making the current request. Pushes each
 * recipient a live "notification:new" so an already-open tab updates without a manual refresh. */
export async function createNotifications(notifications: NotificationInput[]) {
  const result = await prisma.notification.createMany({ data: notifications });
  for (const n of notifications) emitRealtime(`user:${n.userId}`, "notification:new");
  return result;
}

/** Sends one notification to every active admin - for things that need an admin to act
 * (a disputed payment, a course changed after review). */
export async function notifyAdmins(notification: Omit<NotificationInput, "userId">) {
  const admins = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["ADMIN", "SUPER_ADMIN"] } } } } },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await createNotifications(admins.map((admin) => ({ ...notification, userId: admin.id })));
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
