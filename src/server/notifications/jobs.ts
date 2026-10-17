// Job processors run by the worker (worker/index.ts). Kept here, outside the worker entry point,
// so the integration tests can run them directly. No next/* imports.
import { prisma } from "@/lib/prisma";
import { effectivePreference } from "@/lib/notification-categories";
import { sweepCourseGroupMembership } from "@/server/chat/membership";
import type { RealtimeBus } from "@/server/realtime/bus";
import type { PresenceStore } from "@/server/realtime/presence";
import { sendChatDigestEmail, sendNotificationEmail } from "./email";
import type { DeliveryJob } from "./notify";
import { pushConfigured, sendPushToUser } from "./push";

export type JobDeps = { bus: RealtimeBus; presence: PresenceStore };

/** Web push this long after a chat notification's unread streak began, if it's still unread. */
export const CHAT_PUSH_AFTER_MS = 60_000;
/** One digest email this long after the streak began, if still unread. */
export const CHAT_DIGEST_AFTER_MS = 30 * 60_000;

async function verifiedRecipient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, status: true, emailVerified: true },
  });
  // Only verified addresses: an unverified one may belong to someone who never signed up.
  if (!user || user.status !== "ACTIVE" || !user.emailVerified) return null;
  return user;
}

export async function deliverEmail(job: DeliveryJob) {
  const user = await verifiedRecipient(job.userId);
  if (!user) return { sent: false };
  const result = await sendNotificationEmail(user.email, job);
  if (result.ok && job.notificationId) {
    await prisma.notification.updateMany({ where: { id: job.notificationId }, data: { emailedAt: new Date() } });
  }
  return { sent: result.ok };
}

export async function deliverPush(job: DeliveryJob) {
  const delivered = await sendPushToUser(job.userId, { title: job.title, body: job.body, url: job.link, tag: job.type });
  if (delivered && job.notificationId) {
    await prisma.notification.updateMany({ where: { id: job.notificationId }, data: { pushedAt: new Date() } });
  }
  return { delivered };
}

type PendingChatRow = { id: string; userId: string; entityId: string | null; title: string; body: string | null; link: string | null };

/** Unread chat notifications whose streak began more than `olderThanMs` ago and haven't had this delivery. */
function pendingChatRows(column: "pushedAt" | "emailedAt", olderThanMs: number) {
  const cutoff = Date.now() - olderThanMs;
  // `since` (when the unread streak began) is set on create and survives collapses (notify.ts).
  return column === "pushedAt"
    ? prisma.$queryRaw<PendingChatRow[]>`
        SELECT "id", "userId", "entityId", "title", "body", "link" FROM "Notification"
        WHERE "type" IN ('message', 'announcement') AND "status" = 'UNREAD' AND "pushedAt" IS NULL
          AND COALESCE(("data"->>'since')::bigint, 0) <= ${cutoff}
        ORDER BY "createdAt" LIMIT 500`
    : prisma.$queryRaw<PendingChatRow[]>`
        SELECT "id", "userId", "entityId", "title", "body", "link" FROM "Notification"
        WHERE "type" IN ('message', 'announcement') AND "status" = 'UNREAD' AND "emailedAt" IS NULL
          AND COALESCE(("data"->>'since')::bigint, 0) <= ${cutoff}
        ORDER BY "createdAt" LIMIT 1000`;
}

async function chatPreferences(userIds: string[]) {
  const saved = userIds.length ? await prisma.notificationPreference.findMany({ where: { userId: { in: userIds }, category: "messages" } }) : [];
  const byUser = new Map(saved.map((p) => [p.userId, p]));
  return (userId: string) => effectivePreference("messages", byUser.get(userId));
}

/** Every ~20s: web push for chat unread for a minute, unless the chat is on screen somewhere. */
export async function processChatPushScan(deps: JobDeps) {
  if (!pushConfigured()) return { pushed: 0 };
  const rows = await pendingChatRows("pushedAt", CHAT_PUSH_AFTER_MS);
  if (rows.length === 0) return { pushed: 0 };

  const viewing = await deps.presence.viewing(rows.map((r) => ({ userId: r.userId, conversationId: r.entityId ?? "" })));
  const pref = await chatPreferences([...new Set(rows.map((r) => r.userId))]);
  let pushed = 0;
  for (const [i, row] of rows.entries()) {
    if (!viewing[i] && pref(row.userId).push) {
      pushed += (await sendPushToUser(row.userId, { title: row.title, body: row.body, url: row.link, tag: `chat:${row.entityId}` })) ? 1 : 0;
    }
  }
  // Marked either way: one push per unread streak, and rows nobody wants pushed aren't rescanned.
  await prisma.notification.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { pushedAt: new Date() } });
  return { pushed };
}

/** Every ~5 minutes: one email per person listing the conversations unread for 30+ minutes. */
export async function processChatDigestScan() {
  const rows = await pendingChatRows("emailedAt", CHAT_DIGEST_AFTER_MS);
  if (rows.length === 0) return { emailed: 0 };

  const byUser = new Map<string, PendingChatRow[]>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  const pref = await chatPreferences([...byUser.keys()]);

  let emailed = 0;
  for (const [userId, userRows] of byUser) {
    if (pref(userId).email) {
      const user = await verifiedRecipient(userId);
      if (user) {
        const result = await sendChatDigestEmail(user.email, user.name, userRows);
        if (result.ok) emailed++;
      }
    }
    await prisma.notification.updateMany({ where: { id: { in: userRows.map((r) => r.id) } }, data: { emailedAt: new Date() } });
  }
  return { emailed };
}

export async function processMembershipSweep(deps: JobDeps) {
  return { removed: await sweepCourseGroupMembership(deps.bus) };
}
