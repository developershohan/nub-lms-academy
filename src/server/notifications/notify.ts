/*
 * notify(): the one way a notification is created. It honours each recipient's preferences,
 * collapses repeats (one "3 new messages" instead of three rows), writes the rows, pushes the
 * full notification to the user's open tabs - no "something changed, refetch" round trip - and
 * then sends or queues email and web push.
 *
 * No next/* or "server-only" imports: the socket server and the worker use it too. Each process
 * builds its own notifier with createNotifier(), passing how it pushes to a user (the socket
 * server emits on its io; Next.js publishes through the Redis emitter), how it sends email, and -
 * when Redis is configured - the job queue that hands email and push to the worker.
 */
import { prisma } from "@/lib/prisma";
import { categoryOf, effectivePreference, NOTIFICATION_CATEGORIES, type NotificationType } from "@/lib/notification-categories";
import type { Prisma } from "@/generated/prisma/client";

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  actorId?: string | null;
  entity?: { type: string; id: string };
  data?: Record<string, unknown>;
  /** Collapses into the recipient's unread notification with the same key instead of adding one. */
  groupKey?: string;
  /** Tells open tabs to re-render the page they're on - for changes the page itself shows (a new
   * role, an approved course). Chat messages never set it. */
  refreshPage?: boolean;
};

export type PushedNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  status: "UNREAD" | "READ";
  createdAt: string;
  data: Record<string, unknown> | null;
  groupKey: string | null;
};

type NotificationRow = Prisma.NotificationGetPayload<object>;

export function serializeNotification(row: NotificationRow): PushedNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    data: (row.data as Record<string, unknown> | null) ?? null,
    groupKey: row.groupKey,
  };
}

/** What the worker needs to send one email or one push: the notification, not the user's address. */
export type DeliveryJob = {
  userId: string;
  notificationId: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
};

type Push = (userId: string, event: string, payload: unknown) => void;
type SendEmail = (to: { email: string; name: string | null }, notification: PushedNotification) => Promise<unknown>;
type SendPush = (job: DeliveryJob) => Promise<unknown>;
/** Hands a delivery to the worker; returns false when no queue is available (no Redis). */
type Enqueue = (kind: "email" | "push", job: DeliveryJob) => Promise<boolean>;

export function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, status: "UNREAD" } });
}

export type Notifier = (userIds: string[], input: NotifyInput) => Promise<NotificationRow[]>;

export function createNotifier({
  push,
  sendEmail,
  sendPush,
  enqueue,
}: {
  push: Push;
  sendEmail?: SendEmail;
  sendPush?: SendPush;
  enqueue?: Enqueue;
}): Notifier {
  return async function notify(userIds, input) {
    const recipients = [...new Set(userIds)].filter((id) => id && id !== input.actorId);
    if (recipients.length === 0) return [];

    const category = categoryOf(input.type);
    const timing = NOTIFICATION_CATEGORIES[category];
    const saved = await prisma.notificationPreference.findMany({ where: { userId: { in: recipients }, category } });
    const prefs = new Map(saved.map((p) => [p.userId, effectivePreference(category, p)]));
    const pref = (userId: string) => prefs.get(userId) ?? effectivePreference(category, undefined);

    const inApp = recipients.filter((id) => pref(id).inApp);
    const rows: NotificationRow[] = [];
    for (const userId of inApp) rows.push(await writeOne(userId, input));

    const counts = await prisma.notification.groupBy({
      by: ["userId"],
      where: { userId: { in: inApp }, status: "UNREAD" },
      _count: { _all: true },
    });
    const unread = new Map(counts.map((c) => [c.userId, c._count._all]));
    for (const row of rows) {
      push(row.userId, "notification:new", {
        notification: serializeNotification(row),
        unreadCount: unread.get(row.userId) ?? 0,
        refreshPage: !!input.refreshPage,
      });
    }

    // Chat waits for the worker (push after ~1 minute, an email digest after ~30 minutes, only if
    // still unread); everything else goes out now - through the worker when there is one.
    const byUser = new Map(rows.map((r) => [r.userId, r]));
    const job = (userId: string): DeliveryJob => ({
      userId,
      notificationId: byUser.get(userId)?.id ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    });
    const deliveries: Promise<unknown>[] = [];
    if (timing.emailTiming === "immediate") {
      const emailTo = recipients.filter((id) => pref(id).email);
      if (emailTo.length) {
        const users = await prisma.user.findMany({
          where: { id: { in: emailTo }, status: "ACTIVE" },
          select: { id: true, email: true, name: true },
        });
        for (const user of users) {
          deliveries.push(
            (async () => {
              if (enqueue && (await enqueue("email", job(user.id)))) return;
              if (sendEmail) await sendEmail(user, byUser.has(user.id) ? serializeNotification(byUser.get(user.id)!) : emailOnly(user.id, input));
            })()
          );
        }
      }
    }
    if (timing.pushTiming === "immediate") {
      for (const userId of recipients.filter((id) => pref(id).push)) {
        deliveries.push(
          (async () => {
            if (enqueue && (await enqueue("push", job(userId)))) return;
            if (sendPush) await sendPush(job(userId));
          })()
        );
      }
    }
    // Email and push are best effort: a failed send must never fail whatever caused the notification.
    await Promise.allSettled(deliveries);
    return rows;
  };
}

/** For someone who turned the in-app copy off but kept email. */
function emailOnly(userId: string, input: NotifyInput): PushedNotification {
  return {
    id: `email-${userId}`,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    status: "UNREAD",
    createdAt: new Date().toISOString(),
    data: input.data ?? null,
    groupKey: input.groupKey ?? null,
  };
}

/**
 * Collapses into the unread notification with the same group key, or writes a new one. A
 * collapsed row keeps `since` (when its unread streak began) - the worker's chat push and digest
 * are timed from it - and bumps `count`.
 */
async function writeOne(userId: string, input: NotifyInput): Promise<NotificationRow> {
  const fields = {
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    actorId: input.actorId ?? null,
    entityType: input.entity?.type ?? null,
    entityId: input.entity?.id ?? null,
    groupKey: input.groupKey ?? null,
  };
  const now = new Date();
  if (input.groupKey) {
    const open = await prisma.notification.findFirst({
      where: { userId, groupKey: input.groupKey, status: "UNREAD" },
      orderBy: { createdAt: "desc" },
    });
    if (open) {
      const previous = (open.data as { count?: number; since?: number } | null) ?? {};
      const count = Number(previous.count ?? 1) + 1;
      return prisma.notification.update({
        where: { id: open.id },
        data: { ...fields, data: { ...input.data, count, since: previous.since ?? open.createdAt.getTime() }, createdAt: now },
      });
    }
  }
  return prisma.notification.create({
    data: {
      userId,
      ...fields,
      createdAt: now,
      data: input.groupKey ? { ...input.data, count: 1, since: now.getTime() } : (input.data as Prisma.InputJsonValue),
    },
  });
}

/** Marks a collapsed group read - reading a conversation clears its message notifications. Returns
 * how many were cleared and the user's unread total afterwards. */
export async function markGroupRead(userId: string, groupKey: string) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, groupKey, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });
  return { cleared: count, unreadCount: count > 0 ? await countUnread(userId) : null };
}
