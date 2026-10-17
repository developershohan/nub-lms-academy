import "server-only";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import { sendNotificationEmail } from "@/lib/email";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  effectivePreference,
  type NotificationCategory,
} from "@/lib/notification-categories";
import {
  countUnread,
  createNotifier,
  serializeNotification,
  type DeliveryJob,
  type NotifyInput,
} from "@/server/notifications/notify";
import { sendPushToUser } from "@/server/notifications/push";
import { enqueueDelivery } from "@/server/realtime/queues";

/** notify() for the Next.js app: pushes through the realtime emitter; email and web push go to
 * the worker when Redis is configured, and straight out from here otherwise. */
export const notify = createNotifier({
  push: (userId, event, payload) => emitRealtime(`user:${userId}`, event, payload),
  sendEmail: (to, notification) => sendNotificationEmail(to.email, notification),
  sendPush: (job: DeliveryJob) => sendPushToUser(job.userId, { title: job.title, body: job.body, url: job.link, tag: job.type }),
  enqueue: enqueueDelivery,
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

export type NotificationTab = "all" | "unread" | NotificationCategory;

/** The types a category tab lists. */
function typesIn(category: NotificationCategory) {
  return Object.entries(NOTIFICATION_TYPES)
    .filter(([, c]) => c === category)
    .map(([type]) => type);
}

/** Newest first. `before` is the id of the oldest one the client has, for "load more". */
export async function listNotificationsForUser(
  userId: string,
  { limit = 20, before, unreadOnly = false, tab }: { limit?: number; before?: string; unreadOnly?: boolean; tab?: NotificationTab } = {}
) {
  const filter = tab === "unread" ? { status: "UNREAD" as const } : tab && tab !== "all" ? { type: { in: typesIn(tab) } } : {};
  const rows = await prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { status: "UNREAD" } : {}), ...filter },
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
  choices: { category: NotificationCategory; inApp: boolean; email: boolean; push?: boolean }[]
) {
  await prisma.$transaction(
    choices.map(({ category, inApp, email, push }) => {
      const info = NOTIFICATION_CATEGORIES[category];
      const data = { inApp: info.inAppLocked || inApp, email: info.emailAvailable && email, push: push ?? info.defaults.push };
      return prisma.notificationPreference.upsert({
        where: { userId_category: { userId, category } },
        create: { userId, category, ...data },
        update: data,
      });
    })
  );
  return { ok: true } as const;
}

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null
) {
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
    // The same browser signing in as someone else takes the subscription with it.
    update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
  });
  return { ok: true } as const;
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return { ok: true } as const;
}

export function countPushSubscriptions(userId: string) {
  return prisma.pushSubscription.count({ where: { userId } });
}
