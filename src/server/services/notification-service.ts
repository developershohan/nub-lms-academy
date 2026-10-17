import "server-only";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import { sendNotificationEmail } from "@/lib/email";
import {
  NOTIFICATION_CATEGORIES,
  effectivePreference,
  type NotificationCategory,
} from "@/lib/notification-categories";
import {
  countUnread,
  createNotifier,
  serializeNotification,
  type NotifyInput,
} from "@/server/notifications/notify";

/** notify() for the Next.js app: pushes through the realtime emitter, emails via Resend. */
export const notify = createNotifier({
  push: (userId, event, payload) => emitRealtime(`user:${userId}`, event, payload),
  sendEmail: (to, notification) => sendNotificationEmail(to.email, notification),
});

async function activeUserIdsWithRoles(roles: ("ADMIN" | "SUPER_ADMIN" | "SUPPORT")[]) {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: roles } } } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Every active admin - for things an admin has to act on (a disputed payment, a course changed after review). */
export async function notifyAdmins(input: NotifyInput) {
  return notify(await activeUserIdsWithRoles(["ADMIN", "SUPER_ADMIN"]), input);
}

/** Admins and support staff - a new support request. */
export async function notifyStaff(input: NotifyInput) {
  return notify(await activeUserIdsWithRoles(["ADMIN", "SUPER_ADMIN", "SUPPORT"]), input);
}

export const countUnreadNotifications = countUnread;

/** Newest first. `before` is the id of the oldest one the client has, for "load more". */
export async function listNotificationsForUser(
  userId: string,
  { limit = 20, before, unreadOnly = false }: { limit?: number; before?: string; unreadOnly?: boolean } = {}
) {
  const rows = await prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { status: "UNREAD" } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });
  return { notifications: rows.slice(0, limit).map(serializeNotification), hasMore: rows.length > limit };
}

/** For the dashboards' bell - the shell renders it on every page, so a short list. */
export async function getNotificationBellProps(userId: string) {
  const [{ notifications }, unreadCount] = await Promise.all([
    listNotificationsForUser(userId, { limit: 8 }),
    countUnread(userId),
  ]);
  return { notifications, unreadCount };
}

/** Other open tabs drop the badge too. */
function pushRead(userId: string, payload: { ids?: string[]; all?: boolean; unreadCount: number }) {
  emitRealtime(`user:${userId}`, "notification:read", payload);
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });
  const exists = result.count > 0 || (await prisma.notification.count({ where: { id: notificationId, userId } })) > 0;
  if (!exists) return { error: "Not found" } as const;
  const unreadCount = await countUnread(userId);
  if (result.count > 0) pushRead(userId, { ids: [notificationId], unreadCount });
  return { ok: true, unreadCount } as const;
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, status: "UNREAD" }, data: { status: "READ", readAt: new Date() } });
  pushRead(userId, { all: true, unreadCount: 0 });
  return { ok: true, unreadCount: 0 } as const;
}

/** Every category with the user's effective choice, for the preferences page. */
export async function getNotificationPreferences(userId: string) {
  const saved = await prisma.notificationPreference.findMany({ where: { userId } });
  const byCategory = new Map(saved.map((p) => [p.category, p]));
  return (Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[]).map((category) => ({
    category,
    ...NOTIFICATION_CATEGORIES[category],
    ...effectivePreference(category, byCategory.get(category)),
  }));
}

/** Saves the user's choices; locked channels and email for categories without it stay as they must. */
export async function updateNotificationPreferences(
  userId: string,
  choices: { category: NotificationCategory; inApp: boolean; email: boolean }[]
) {
  await prisma.$transaction(
    choices.map(({ category, inApp, email }) => {
      const info = NOTIFICATION_CATEGORIES[category];
      const data = { inApp: info.inAppLocked || inApp, email: info.emailAvailable && email };
      return prisma.notificationPreference.upsert({
        where: { userId_category: { userId, category } },
        create: { userId, category, ...data },
        update: data,
      });
    })
  );
  return { ok: true } as const;
}
