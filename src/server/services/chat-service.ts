import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessConversation, canAccessCourse, canManageCourse, canModerateChat } from "@/lib/permissions";
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

const STAFF_ROLES = ["ADMIN", "SUPER_ADMIN", "SUPPORT"] as const;
const isStaffRoleList = (roles: RoleName[]) => roles.some((r) => (STAFF_ROLES as readonly RoleName[]).includes(r));

/**
 * A DIRECT conversation may be started when either side is staff (admin/support can message
 * anyone, and anyone can reach staff - this is the "admin can chat with anyone" / support-contact
 * path), or the two accounts are connected through a course: teacher <-> their student,
 * classmate <-> classmate sharing an active enrollment, or sub-instructor <-> the owning teacher
 * / that course's enrolled students. Otherwise students/teachers could message arbitrary
 * strangers on the platform.
 */
export async function startDirectConversation(userId: string, otherUserId: string) {
  if (userId === otherUserId) return { error: "Cannot message yourself" } as const;

  const [caller, other] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } }),
    prisma.user.findUnique({ where: { id: otherUserId }, include: { roles: { include: { role: true } } } }),
  ]);
  if (!other || other.status !== "ACTIVE") return { error: "User not found" } as const;

  let allowed =
    isStaffRoleList((caller?.roles ?? []).map((r) => r.role.name)) ||
    isStaffRoleList(other.roles.map((r) => r.role.name));

  if (!allowed) {
    const sharedEnrollment = await prisma.enrollment.findFirst({
      where: {
        status: "ACTIVE",
        OR: [
          // teacher <-> their student, either direction
          { userId, course: { teacherId: otherUserId } },
          { userId: otherUserId, course: { teacherId: userId } },
          // classmate <-> classmate: both actively enrolled in the same course
          { userId, course: { enrollments: { some: { userId: otherUserId, status: "ACTIVE" } } } },
        ],
      },
    });
    allowed = !!sharedEnrollment;
  }

  if (!allowed) {
    const sharedViaSubInstructor = await prisma.courseInstructor.findFirst({
      where: {
        OR: [
          // caller is the owning teacher, other is a sub-instructor on caller's course
          { userId: otherUserId, course: { teacherId: userId } },
          // other is the owning teacher, caller is a sub-instructor on their course
          { userId, course: { teacherId: otherUserId } },
          // caller is sub-instructor, other is a student actively enrolled in that course
          { userId, course: { enrollments: { some: { userId: otherUserId, status: "ACTIVE" } } } },
          // other is sub-instructor, caller is a student actively enrolled in that course
          { userId: otherUserId, course: { enrollments: { some: { userId, status: "ACTIVE" } } } },
        ],
      },
    });
    allowed = !!sharedViaSubInstructor;
  }

  if (!allowed) return { error: "You can only message people connected to your courses" } as const;

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

/** Staff-only "start a conversation with anyone" search (admin/support chat is otherwise limited
 * to the same course-connection rules as everyone else - see startDirectConversation). Callers
 * must check canModerateChat themselves; this has no internal check since it's read-only and the
 * result set (name/email) mirrors what listUsersForAdmin already exposes to the same audience. */
export type ChatUserSearchResult = {
  id: string;
  name: string | null;
  email: string;
  roles: { role: { name: RoleName } }[];
};

export function searchUsersToMessage(
  query: string,
  excludeUserId: string,
  limit = 20
): Promise<ChatUserSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return Promise.resolve([]);

  return prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      status: "ACTIVE",
      OR: [{ name: { contains: trimmed, mode: "insensitive" } }, { email: { contains: trimmed, mode: "insensitive" } }],
    },
    select: { id: true, name: true, email: true, roles: { select: { role: { select: { name: true } } } } },
    take: limit,
    orderBy: { name: "asc" },
  });
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

export async function hideMessage(actorId: string, messageId: string) {
  if (!(await canModerateChat(actorId))) return { error: "Forbidden" } as const;

  await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  await logAudit(actorId, "message:moderate", "Message", messageId);
  revalidatePath("/admin/messages");
  return { ok: true } as const;
}
