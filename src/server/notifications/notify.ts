/*
 * notify(): the one way a notification is created. It honours each recipient's preferences,
 * collapses repeats (one "3 new messages" instead of three rows), writes the rows, and pushes the
 * full notification to the user's open tabs - no "something changed, refetch" round trip.
 *
 * No next/* or "server-only" imports: the socket server uses it too. Each process builds its own
 * notifier with createNotifier(), passing how it pushes to a user (the socket server emits on its
 * io; Next.js publishes through the Redis emitter) and, optionally, how it sends email.
 */
import { prisma } from "@/lib/prisma";
import { categoryOf, effectivePreference, type NotificationType } from "@/lib/notification-categories";
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

type Push = (userId: string, event: string, payload: unknown) => void;
type SendEmail = (to: { email: string; name: string | null }, notification: PushedNotification) => Promise<unknown>;

export function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, status: "UNREAD" } });
}

export function createNotifier({ push, sendEmail }: { push: Push; sendEmail?: SendEmail }) {
  return async function notify(userIds: string[], input: NotifyInput) {
    const recipients = [...new Set(userIds)].filter((id) => id && id !== input.actorId);
    if (recipients.length === 0) return [];

    const category = categoryOf(input.type);
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

    const emailTo = recipients.filter((id) => pref(id).email);
    if (sendEmail && emailTo.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: emailTo }, status: "ACTIVE" },
        select: { id: true, email: true, name: true },
      });
      const byUser = new Map(rows.map((r) => [r.userId, serializeNotification(r)]));
      // Email is best effort: a failed send must never fail whatever caused the notification.
      await Promise.allSettled(users.map(async (u) => sendEmail(u, byUser.get(u.id) ?? emailOnly(u.id, input))));
    }
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

/** Collapses into the unread notification with the same group key, or writes a new one. */
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
  if (input.groupKey) {
    const open = await prisma.notification.findFirst({
      where: { userId, groupKey: input.groupKey, status: "UNREAD" },
      orderBy: { createdAt: "desc" },
    });
    if (open) {
      const count = Number((open.data as { count?: number } | null)?.count ?? 1) + 1;
      return prisma.notification.update({
        where: { id: open.id },
        data: { ...fields, data: { ...input.data, count }, createdAt: new Date() },
      });
    }
  }
  return prisma.notification.create({
    data: { userId, ...fields, data: input.groupKey ? { ...input.data, count: 1 } : (input.data as Prisma.InputJsonValue) },
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
