import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessConversation, canAccessCourse, canManageCourse, canAdminAccess } from "@/lib/permissions";
import { createNotifications } from "@/server/services/notification-service";
import { logAudit } from "@/lib/audit";
import type { RoleName } from "@/generated/prisma/client";

function messagesPathForRoles(roles: RoleName[]) {
  if (roles.includes("ADMIN") || roles.includes("SUPER_ADMIN")) return "/admin/messages";
  if (roles.includes("TEACHER")) return "/teacher/messages";
  return "/student/messages";
}

function revalidateChatPaths() {
  revalidatePath("/student/messages");
  revalidatePath("/teacher/messages");
  revalidatePath("/admin/messages");
}

/** A DIRECT conversation may only be started with an admin (support-style) or a teacher the
 * caller shares an active enrollment with (in either direction) - otherwise students/teachers
 * could message arbitrary strangers on the platform. */
export async function startDirectConversation(userId: string, otherUserId: string) {
  if (userId === otherUserId) return { error: "Cannot message yourself" } as const;

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    include: { roles: { include: { role: true } } },
  });
  if (!other || other.status !== "ACTIVE") return { error: "User not found" } as const;

  const otherRoles = other.roles.map((r) => r.role.name);
  const isOtherStaff = otherRoles.includes("ADMIN") || otherRoles.includes("SUPER_ADMIN");

  if (!isOtherStaff) {
    const shared = await prisma.enrollment.findFirst({
      where: {
        status: "ACTIVE",
        OR: [
          { userId, course: { teacherId: otherUserId } },
          { userId: otherUserId, course: { teacherId: userId } },
        ],
      },
    });
    if (!shared) return { error: "You can only message a teacher connected to your courses" } as const;
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      type: "DIRECT",
      AND: [{ participants: { some: { userId } } }, { participants: { some: { userId: otherUserId } } }],
    },
  });
  if (existing) return { ok: true, conversationId: existing.id } as const;

  const conversation = await prisma.conversation.create({
    data: { type: "DIRECT", participants: { create: [{ userId }, { userId: otherUserId }] } },
  });
  revalidateChatPaths();
  return { ok: true, conversationId: conversation.id } as const;
}

export async function startSupportConversation(userId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { type: "SUPPORT", participants: { some: { userId } } },
  });
  if (existing) return { ok: true, conversationId: existing.id } as const;

  const conversation = await prisma.conversation.create({
    data: { type: "SUPPORT", participants: { create: [{ userId }] } },
  });
  revalidateChatPaths();
  return { ok: true, conversationId: conversation.id } as const;
}

/** Participants are added lazily on first visit rather than backfilled on enrollment - access to
 * the room itself is derived live from canAccessCourse/canManageCourse (see permissions.ts), so a
 * participant row here only exists to track per-user lastReadAt. */
export async function getOrCreateCourseGroupConversation(userId: string, courseId: string) {
  const allowed = (await canManageCourse(userId, courseId)) || (await canAccessCourse(userId, courseId));
  if (!allowed) return { error: "Forbidden" } as const;

  let conversation = await prisma.conversation.findFirst({ where: { type: "COURSE_GROUP", courseId } });
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { type: "COURSE_GROUP", courseId } });
  }
  await prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId: conversation.id, userId } },
    create: { conversationId: conversation.id, userId },
    update: {},
  });
  return { ok: true, conversationId: conversation.id } as const;
}

export function listConversationsForUser(userId: string) {
  return prisma.conversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      course: { select: { id: true, title: true } },
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** Moderation/reply queue for support staff - every SUPPORT conversation, not just ones they've
 * personally joined (canAccessConversation already grants moderators blanket read access). */
export function listSupportConversationsForAdmin() {
  return prisma.conversation.findMany({
    where: { type: "SUPPORT" },
    include: {
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export type ConversationSummary = {
  id: string;
  type: "DIRECT" | "COURSE_GROUP" | "SUPPORT";
  label: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: boolean;
};

function summarizeForUser(
  conversation: Awaited<ReturnType<typeof listConversationsForUser>>[number],
  currentUserId: string
): ConversationSummary {
  const other = conversation.participants.find((p) => p.userId !== currentUserId);
  const label =
    conversation.type === "COURSE_GROUP"
      ? (conversation.course?.title ?? "Course chat")
      : conversation.type === "SUPPORT"
        ? "Support"
        : (other?.user.name ?? other?.user.email ?? "Direct message");
  const last = conversation.messages[0] as { content: string; createdAt: Date; senderId: string } | undefined;
  const mine = conversation.participants.find((p) => p.userId === currentUserId);
  const unread = !!last && last.senderId !== currentUserId && (!mine?.lastReadAt || mine.lastReadAt < last.createdAt);

  return {
    id: conversation.id,
    type: conversation.type,
    label,
    lastMessage: last?.content ?? null,
    lastMessageAt: last ? last.createdAt.toISOString() : null,
    unread,
  };
}

export async function listConversationSummariesForUser(userId: string): Promise<ConversationSummary[]> {
  const conversations = await listConversationsForUser(userId);
  return conversations.map((c) => summarizeForUser(c, userId));
}

export async function listSupportConversationSummariesForAdmin(): Promise<ConversationSummary[]> {
  const conversations = await listSupportConversationsForAdmin();
  return conversations.map((conversation) => {
    const requester = conversation.participants[0];
    const last = conversation.messages[0] as { content: string; createdAt: Date } | undefined;
    return {
      id: conversation.id,
      type: "SUPPORT" as const,
      label: requester?.user.name ?? requester?.user.email ?? "Support request",
      lastMessage: last?.content ?? null,
      lastMessageAt: last ? last.createdAt.toISOString() : null,
      unread: false,
    };
  });
}

export async function listMessages(userId: string, conversationId: string, limit = 50) {
  if (!(await canAccessConversation(userId, conversationId))) return { error: "Forbidden" } as const;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return { ok: true, messages } as const;
}

export async function sendMessage(senderId: string, conversationId: string, content: string) {
  if (!(await canAccessConversation(senderId, conversationId))) return { error: "Forbidden" } as const;

  const trimmed = content.trim();
  if (!trimmed) return { error: "Message cannot be empty" } as const;
  if (trimmed.length > 2000) return { error: "Message is too long" } as const;

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, senderId, content: trimmed },
      include: { sender: { select: { id: true, name: true } } },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    await tx.conversationParticipant.updateMany({
      where: { conversationId, userId: senderId },
      data: { lastReadAt: new Date() },
    });
    return created;
  });

  const recipients = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: senderId } },
    select: { userId: true, user: { select: { roles: { select: { role: { select: { name: true } } } } } } },
  });
  if (recipients.length) {
    await createNotifications(
      recipients.map((r) => ({
        userId: r.userId,
        type: "message",
        title: "New message",
        body: trimmed.slice(0, 140),
        link: messagesPathForRoles(r.user.roles.map((x) => x.role.name)),
      }))
    );
  }

  revalidateChatPaths();
  return { ok: true, message } as const;
}

export async function markConversationRead(userId: string, conversationId: string) {
  if (!(await canAccessConversation(userId, conversationId))) return { error: "Forbidden" } as const;

  await prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });

  const unread = await prisma.message.findMany({
    where: { conversationId, senderId: { not: userId } },
    select: { id: true },
  });
  if (unread.length) {
    await prisma.messageReadReceipt.createMany({
      data: unread.map((m) => ({ messageId: m.id, userId })),
      skipDuplicates: true,
    });
  }
  return { ok: true } as const;
}

export async function getConversationParticipants(userId: string, conversationId: string) {
  if (!(await canAccessConversation(userId, conversationId))) return { error: "Forbidden" } as const;

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return { ok: true, participants } as const;
}

/** Sender-initiated soft delete - moderation hide (hideMessage) uses the same field. */
export async function deleteOwnMessage(userId: string, messageId: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.senderId !== userId) return { error: "Forbidden" } as const;

  await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  revalidateChatPaths();
  return { ok: true } as const;
}

export async function reportMessage(userId: string, messageId: string, reason: string | undefined) {
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!message || !(await canAccessConversation(userId, message.conversationId))) {
    return { error: "Forbidden" } as const;
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { reportedAt: new Date(), reportReason: reason ?? null },
  });
  return { ok: true } as const;
}

export function listRecentMessagesForAdmin(limit = 50) {
  return prisma.message.findMany({
    where: { deletedAt: null },
    include: {
      sender: { select: { id: true, name: true, email: true } },
      conversation: { select: { type: true, course: { select: { title: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function hideMessage(actorId: string, messageId: string) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" } as const;

  await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  await logAudit(actorId, "message:moderate", "Message", messageId);
  revalidatePath("/admin/messages");
  return { ok: true } as const;
}
