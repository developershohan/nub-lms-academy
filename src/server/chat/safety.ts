/*
 * Blocking people and reporting messages. No next/* imports. Callers pass the process's notifier
 * (createNotifier) and realtime bus, like the rest of src/server/chat.
 */
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { NotifyInput } from "@/server/notifications/notify";
import { rooms, type RealtimeBus } from "@/server/realtime/bus";
import { isStaff, type ChatUser } from "./access";
import { directKey, messagePreview, MESSAGE_INCLUDE, removeChatMessage, serializeMessage, staffUserIds, type ChatMessageWire } from "./messages";

type Notify = (userIds: string[], input: NotifyInput) => Promise<unknown>;

/** Tells both people's tabs whether their DM still accepts messages, and drops cached permissions. */
async function announceBlockChange(bus: RealtimeBus, blockerId: string, blockedId: string, blocked: boolean) {
  bus.invalidateUser(blockerId);
  bus.invalidateUser(blockedId);
  const dm = await prisma.conversation.findUnique({ where: { uniqueKey: directKey(blockerId, blockedId) }, select: { id: true } });
  if (!dm) return;
  bus.emit(rooms.user(blockerId), "conversation:updated", { conversationId: dm.id, blocked: blocked ? "by_me" : "none", canPost: !blocked });
  bus.emit(rooms.user(blockedId), "conversation:updated", { conversationId: dm.id, blocked: blocked ? "by_them" : "none", canPost: !blocked });
}

/** Stops direct messages both ways. Course channels and support are unaffected. */
export async function blockUser(bus: RealtimeBus, user: ChatUser, targetId: string) {
  if (targetId === user.id) return { error: "You can't block yourself" } as const;
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, roles: { select: { role: { select: { name: true } } } } },
  });
  if (!target) return { error: "User not found" } as const;
  // Support must stay reachable, and staff need to be able to answer anyone.
  if (isStaff({ roleNames: target.roles.map((r) => r.role.name) })) return { error: "Support staff can't be blocked" } as const;

  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: targetId } },
    create: { blockerId: user.id, blockedId: targetId },
    update: {},
  });
  await announceBlockChange(bus, user.id, targetId, true);
  return { ok: true } as const;
}

export async function unblockUser(bus: RealtimeBus, user: ChatUser, targetId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: targetId } });
  const stillBlocked = await prisma.userBlock.count({ where: { blockerId: targetId, blockedId: user.id } });
  if (stillBlocked === 0) await announceBlockChange(bus, user.id, targetId, false);
  else bus.invalidateUser(user.id);
  return { ok: true } as const;
}

/** Files a report (one per reporter and message) and alerts staff, collapsed into one open item. */
export async function reportMessage(notify: Notify, user: ChatUser, messageId: string, reason: string | undefined) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, senderId: true, content: true, reportedAt: true },
  });
  if (!message) return { error: "Not found" } as const;
  if (message.senderId === user.id) return { error: "You can't report your own message" } as const;

  const existing = await prisma.report.findUnique({ where: { reporterId_messageId: { reporterId: user.id, messageId } } });
  if (existing) return { ok: true } as const;
  await prisma.$transaction([
    prisma.report.create({
      data: { reporterId: user.id, targetType: "MESSAGE", messageId, targetUserId: message.senderId, reason: reason || null },
    }),
    prisma.message.update({ where: { id: messageId }, data: { reportedAt: message.reportedAt ?? new Date(), reportReason: reason || null } }),
  ]);
  const preview = messagePreview({ content: message.content, deletedAt: null });
  await notify(await staffUserIds(), {
    type: "message_report",
    title: "A message was reported",
    body: reason ? `${reason} - "${preview}"` : `"${preview}"`,
    link: "/admin/messages?tab=reports",
    actorId: user.id,
    entity: { type: "Message", id: messageId },
    groupKey: "moderation:reports",
  });
  return { ok: true } as const;
}

export type ReportListItem = {
  id: string;
  reason: string | null;
  createdAt: string;
  reporter: { id: string; name: string | null } | null;
  message: ChatMessageWire | null;
  conversationId: string | null;
};

export async function listOpenReports(user: ChatUser): Promise<ReportListItem[]> {
  if (!isStaff(user)) return [];
  const rows = await prisma.report.findMany({
    where: { status: "OPEN", targetType: "MESSAGE" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { reporter: { select: { id: true, name: true } }, message: { include: MESSAGE_INCLUDE } },
  });
  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    reporter: r.reporter,
    // Staff see what was reported even when it has since been removed.
    message: r.message ? serializeMessage(r.message, { moderator: true }) : null,
    conversationId: r.message?.conversationId ?? null,
  }));
}

/**
 * Closes a report, optionally removing the message. Every open report on that message closes
 * with it. Returns the removed message (if any) for the caller to broadcast.
 */
export async function resolveReport(user: ChatUser, reportId: string, action: "remove" | "dismiss") {
  if (!isStaff(user)) return { error: "Forbidden" } as const;
  const report = await prisma.report.findUnique({ where: { id: reportId }, select: { messageId: true } });
  if (!report) return { error: "Not found" } as const;
  let removed: ChatMessageWire | null = null;
  if (action === "remove" && report.messageId) {
    const result = await removeChatMessage({ messageId: report.messageId, userId: user.id, moderator: true });
    if ("error" in result) return { error: result.error } as const;
    removed = result.message;
  }
  await prisma.report.updateMany({
    where: report.messageId ? { messageId: report.messageId, status: "OPEN" } : { id: reportId },
    data: { status: action === "remove" ? "RESOLVED" : "DISMISSED", resolvedById: user.id, resolvedAt: new Date() },
  });
  await logAudit(user.id, `report:${action}`, "Report", reportId);
  return { ok: true, removed } as const;
}
