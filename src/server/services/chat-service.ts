import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessCourse, canManageCourse, canModerateChat } from "@/lib/permissions";
import { notify } from "@/server/services/notification-service";
import { logAudit } from "@/lib/audit";
import { emitRealtime, realtimeBus } from "@/lib/realtime";
import { rooms } from "@/server/realtime/bus";
import {
  blockStateBetween,
  canStartDirect,
  getChatUser,
  isStaff,
  resolveAccess,
  type BlockState,
  type ChatUser,
  type ParticipantRole,
} from "@/server/chat/access";
import { ensureCourseChannels, type ChannelKind } from "@/server/chat/channels";
import { reconcileCourseGroupsThrottled } from "@/server/chat/membership";
import {
  directKey,
  editChatMessage,
  findOrCreateConversation,
  latestPreview,
  listMessagePage,
  listMessagesAfter,
  markChatRead,
  memberIds,
  messagePreview,
  notifyAboutMessage,
  removeChatMessage,
  sendChatMessage,
  toggleReaction,
} from "@/server/chat/messages";
import { blockUser, reportMessage as fileReport, resolveReport, unblockUser } from "@/server/chat/safety";
import { ensureTicket, serializeTicket, TICKET_INCLUDE, updateTicket, type TicketWire } from "@/server/chat/support";
import type { RoleName } from "@/generated/prisma/client";

function revalidateChatPaths() {
  revalidatePath("/student/messages");
  revalidatePath("/teacher/messages");
  revalidatePath("/admin/messages");
}

/** The signed-in user as chat sees them - status and roles re-read from the database. */
export async function chatUserFor(userId: string): Promise<ChatUser | null> {
  return getChatUser(userId);
}

/**
 * A DIRECT conversation may be started when either side is staff (admin/support can message
 * anyone, and anyone can reach staff), or the two accounts are connected through a course:
 * teacher <-> their student, classmate <-> classmate sharing an active enrollment, or
 * co-instructor <-> the owning teacher / that course's enrolled students (see canStartDirect).
 */
export async function startDirectConversation(userId: string, otherUserId: string) {
  const user = await getChatUser(userId);
  if (!user) return { error: "Not found" } as const;
  const allowed = await canStartDirect(user, otherUserId);
  if ("error" in allowed) return { error: allowed.error } as const;

  const uniqueKey = directKey(userId, otherUserId);
  const conversation = await findOrCreateConversation(uniqueKey, () =>
    prisma.conversation.create({
      data: { type: "DIRECT", uniqueKey, participants: { create: [{ userId }, { userId: otherUserId }] } },
    })
  );
  if (conversation.created) revalidateChatPaths();
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

/** One support thread per customer ("support:<userId>"), with its ticket. */
export async function startSupportConversation(userId: string) {
  const uniqueKey = `support:${userId}`;
  const conversation = await findOrCreateConversation(uniqueKey, () =>
    prisma.conversation.create({
      data: { type: "SUPPORT", uniqueKey, participants: { create: [{ userId, role: "OWNER" }] }, supportTicket: { create: { requesterId: userId } } },
    })
  );
  if (!conversation.created) await prisma.$transaction((tx) => ensureTicket(tx, conversation.id));
  if (conversation.created) revalidateChatPaths();
  return { ok: true, conversationId: conversation.id } as const;
}

/**
 * Opens a course community channel (#general by default). Access is derived live from the
 * course (canAccessCourse / canManageCourse); the participant row carries the member's role and
 * read position. Opening the course also makes sure its standard channels exist.
 */
export async function getOrCreateCourseGroupConversation(userId: string, courseId: string, channel: ChannelKind = "GENERAL") {
  const allowed = (await canManageCourse(userId, courseId)) || (await canAccessCourse(userId, courseId));
  if (!allowed) return { error: "Forbidden" } as const;

  const channels = await ensureCourseChannels(courseId);
  const target = channels.find((c) => c.channel === channel) ?? channels[0];
  const user = await getChatUser(userId);
  if (!user) return { error: "Forbidden" } as const;
  const access = await resolveAccess(user, target.id);
  if (!access.ok) return { error: "Forbidden" } as const;
  if (access.role) {
    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: target.id, userId } },
      create: { conversationId: target.id, userId, role: access.role },
      update: { removedAt: null, role: access.role },
    });
  }
  return { ok: true, conversationId: target.id } as const;
}

const SUMMARY_INCLUDE = {
  course: { select: { id: true, title: true } },
  participants: { where: { removedAt: null }, include: { user: { select: { id: true, name: true, email: true } } } },
  messages: { orderBy: { seq: "desc" as const }, take: 1 },
  supportTicket: { include: TICKET_INCLUDE },
};

/** Most recent activity first, minus channels the user was removed from. Joins any course channels they gained access to. */
export async function listConversationsForUser(userId: string) {
  await reconcileCourseGroupsThrottled(realtimeBus, userId);
  return prisma.conversation.findMany({
    where: { participants: { some: { userId, removedAt: null } } },
    include: SUMMARY_INCLUDE,
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
  });
}

/** Moderation/reply queue for support staff - every SUPPORT conversation, not just ones they've
 * personally joined (staff get blanket read access from resolveAccess). */
export function listSupportConversationsForAdmin() {
  return prisma.conversation.findMany({
    where: { type: "SUPPORT" },
    include: SUMMARY_INCLUDE,
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
  });
}

export type ConversationSummary = {
  id: string;
  type: "DIRECT" | "COURSE_GROUP" | "SUPPORT";
  label: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  /** Messages after the user's lastReadSeq. */
  unread: number;
  lastSeq: number;
  /** For a DM, the other member - the inbox shows whether they're online. */
  otherUserId: string | null;
  /** Course community channels: which one, and of which course. */
  courseId: string | null;
  courseTitle: string | null;
  channel: ChannelKind | null;
  /** The viewer's role; null when staff look at a thread they aren't a member of. */
  role: ParticipantRole | null;
  mutedUntil: string | null;
  blocked: BlockState;
  canPost: boolean;
  postingBlockedReason: string | null;
  canModerate: boolean;
  slowModeSec: number;
  pinnedMessageId: string | null;
  ticket: TicketWire | null;
};

type SummaryRow = Awaited<ReturnType<typeof listConversationsForUser>>[number];

function channelLabel(row: SummaryRow) {
  const course = row.course?.title ?? "Course chat";
  switch (row.channel) {
    case "ANNOUNCEMENTS":
      return `${course} · #announcements`;
    case "QA":
      return `${course} · #q-and-a`;
    case "BATCH":
      return `${course} · ${row.title ?? "Batch"}`;
    default:
      return course;
  }
}

function summarizeForUser(row: SummaryRow, viewer: ChatUser, blocks: Map<string, BlockState>): ConversationSummary {
  const other = row.participants.find((p) => p.userId !== viewer.id);
  const mine = row.participants.find((p) => p.userId === viewer.id) ?? null;
  const ticket = row.supportTicket ? serializeTicket(row.supportTicket) : null;
  const isRequester = !!ticket && ticket.requester.id === viewer.id;
  const label =
    row.type === "COURSE_GROUP"
      ? channelLabel(row)
      : row.type === "SUPPORT"
        ? isRequester
          ? "Support"
          : (ticket?.requester.name ?? other?.user.name ?? "Support request")
        : (other?.user.name ?? "Direct message");
  const last = row.messages[0];
  const staff = isStaff(viewer);
  const blocked = row.type === "DIRECT" && other ? (blocks.get(other.userId) ?? "none") : "none";
  const moderatorRole = mine?.role === "OWNER" || mine?.role === "MODERATOR";
  const timedOut = !!mine?.postingBlockedUntil && mine.postingBlockedUntil.getTime() > Date.now();
  let postingBlockedReason: string | null = null;
  if (row.type === "DIRECT") {
    if (!mine) postingBlockedReason = "Staff can read this conversation but not post in it.";
    else if (blocked === "by_me") postingBlockedReason = "You blocked this person. Unblock them to send messages.";
    else if (blocked === "by_them") postingBlockedReason = "You can't reply to this conversation.";
  } else if (row.type === "COURSE_GROUP") {
    if (row.announcementOnly && !moderatorRole && !staff) postingBlockedReason = "Only instructors post in #announcements.";
    else if (timedOut && !moderatorRole && !staff) postingBlockedReason = `A moderator paused your posting until ${mine!.postingBlockedUntil!.toLocaleString()}.`;
  }

  return {
    id: row.id,
    type: row.type,
    label,
    lastMessage: last ? messagePreview(last) : null,
    lastMessageAt: last ? last.createdAt.toISOString() : null,
    unread: mine ? Math.max(0, row.lastSeq - mine.lastReadSeq) : 0,
    lastSeq: row.lastSeq,
    otherUserId: row.type === "DIRECT" ? (other?.userId ?? null) : null,
    courseId: row.courseId,
    courseTitle: row.course?.title ?? null,
    channel: row.channel,
    role: mine?.role ?? null,
    mutedUntil: mine?.mutedUntil?.toISOString() ?? null,
    blocked,
    canPost: postingBlockedReason === null,
    postingBlockedReason,
    canModerate: staff || (row.type === "COURSE_GROUP" && moderatorRole),
    slowModeSec: row.slowModeSec,
    pinnedMessageId: row.pinnedMessageId,
    ticket,
  };
}

/** Block state against each DM partner, in one query. */
async function blockStates(viewerId: string, otherIds: string[]) {
  const map = new Map<string, BlockState>();
  if (otherIds.length === 0) return map;
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId, blockedId: { in: otherIds } }, { blockedId: viewerId, blockerId: { in: otherIds } }] },
    select: { blockerId: true, blockedId: true },
  });
  for (const id of otherIds) {
    if (blocks.some((b) => b.blockerId === viewerId && b.blockedId === id)) map.set(id, "by_me");
    else if (blocks.some((b) => b.blockerId === id)) map.set(id, "by_them");
  }
  return map;
}

async function summarizeAll(rows: SummaryRow[], viewer: ChatUser) {
  const otherIds = rows.filter((r) => r.type === "DIRECT").flatMap((r) => r.participants.filter((p) => p.userId !== viewer.id).map((p) => p.userId));
  const blocks = await blockStates(viewer.id, [...new Set(otherIds)]);
  return rows.map((row) => summarizeForUser(row, viewer, blocks));
}

export async function listConversationSummariesForUser(userId: string): Promise<ConversationSummary[]> {
  const viewer = await getChatUser(userId);
  if (!viewer) return [];
  return summarizeAll(await listConversationsForUser(userId), viewer);
}

export async function listSupportConversationSummariesForAdmin(viewerId: string): Promise<ConversationSummary[]> {
  const viewer = await getChatUser(viewerId);
  if (!viewer || !isStaff(viewer)) return [];
  return summarizeAll(await listSupportConversationsForAdmin(), viewer);
}

/** One conversation as the viewer sees it - the inbox fetches this when a new one appears. */
export async function getConversationSummary(userId: string, conversationId: string) {
  const viewer = await getChatUser(userId);
  if (!viewer) return { error: "Forbidden" } as const;
  const access = await resolveAccess(viewer, conversationId);
  if (!access.ok) return { error: access.reason === "not_found" ? "Not found" : "Forbidden" } as const;
  const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: SUMMARY_INCLUDE });
  const [summary] = await summarizeAll([row], viewer);
  return { ok: true, conversation: summary } as const;
}

/**
 * One page of a conversation, oldest first for display: the newest page, or with `beforeSeq` the
 * page before the oldest message the client has. With `afterSeq` it is the catch-up instead -
 * everything after the newest message the client has (see listMessagesAfter).
 */
export async function listMessages(
  userId: string,
  conversationId: string,
  { beforeSeq, afterSeq }: { beforeSeq?: number; afterSeq?: number } = {}
) {
  const user = await getChatUser(userId);
  if (!user || !(await resolveAccess(user, conversationId)).ok) return { error: "Forbidden" } as const;
  const moderator = isStaff(user);
  if (afterSeq !== undefined) {
    const { messages, reset } = await listMessagesAfter(conversationId, afterSeq, { moderator });
    return { ok: true, messages, hasMore: false, reset } as const;
  }
  const { messages, hasMore } = await listMessagePage(conversationId, { beforeSeq, moderator });
  return { ok: true, messages, hasMore, reset: false } as const;
}

/**
 * Sends from Next.js (the REST API). The socket server does the same for live senders; both go
 * through sendChatMessage, so seq and clientMsgId behave identically either way.
 */
export async function sendMessage(senderId: string, conversationId: string, content: string, clientMsgId?: string, replyToId?: string | null) {
  const user = await getChatUser(senderId);
  if (!user) return { error: "Forbidden" } as const;
  const access = await resolveAccess(user, conversationId);
  if (!access.ok) return { error: "Forbidden" } as const;
  if (!access.canPost) return { error: access.postingBlockedReason ?? "You can't post in this conversation" } as const;

  const result = await sendChatMessage({ conversationId, senderId, content, clientMsgId, replyToId });
  if ("error" in result) return result;
  const { message } = result;
  if (result.duplicate) return { ok: true, message } as const;

  emitRealtime(`conversation:${conversationId}`, "message:new", message);
  const update = {
    conversationId,
    lastSeq: message.seq,
    lastMessageAt: message.createdAt,
    preview: messagePreview(message),
    senderId,
    ...(result.ticket ? { ticket: result.ticket } : {}),
  };
  emitRealtime(`user:${senderId}`, "conversation:updated", { ...update, unread: 0 });
  for (const { userId, unread } of result.recipients) {
    emitRealtime(`user:${userId}`, "conversation:updated", { ...update, unread });
  }
  if (result.conversation.type === "SUPPORT") {
    emitRealtime(rooms.staff, "conversation:updated", update);
    if (result.ticket) emitRealtime(rooms.staff, "ticket:updated", result.ticket);
  }

  // No presence here (that's the socket server's), so every other member is notified.
  await notifyAboutMessage(notify, result);

  revalidateChatPaths();
  return { ok: true, message } as const;
}

export async function markConversationRead(userId: string, conversationId: string, seq?: number) {
  const user = await getChatUser(userId);
  if (!user) return { error: "Forbidden" } as const;
  const access = await resolveAccess(user, conversationId);
  if (!access.ok || !access.isParticipant) return { error: "Forbidden" } as const;

  const result = await markChatRead(conversationId, userId, seq);
  if ("error" in result) return result;
  emitRealtime(`user:${userId}`, "conversation:updated", { conversationId, unread: result.unread });
  emitRealtime(`conversation:${conversationId}`, "conversation:read", {
    conversationId,
    userId,
    lastReadSeq: result.lastReadSeq,
  });
  if (result.notifications.cleared > 0) {
    emitRealtime(`user:${userId}`, "notification:read", {
      groupKey: `conversation:${conversationId}`,
      unreadCount: result.notifications.unreadCount,
    });
  }
  return result;
}

export async function getConversationParticipants(userId: string, conversationId: string) {
  const user = await getChatUser(userId);
  if (!user || !(await resolveAccess(user, conversationId)).ok) return { error: "Forbidden" } as const;

  // No email: in a course group every enrolled student can call this, and classmates' addresses
  // aren't theirs to see.
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId, removedAt: null },
    select: { userId: true, role: true, lastReadSeq: true, user: { select: { id: true, name: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    take: 500,
  });
  return { ok: true, participants } as const;
}

/** After an edit or removal of the newest message: inbox previews need the new text. */
async function pushPreview(conversationId: string) {
  const preview = await latestPreview(conversationId);
  if (!preview) return;
  const members = await memberIds(conversationId);
  emitRealtime(members.map((id) => `user:${id}`), "conversation:updated", preview);
}

/** Sender-initiated edit, from a server action (the socket does the same live). */
export async function editOwnMessage(userId: string, messageId: string, content: string) {
  const result = await editChatMessage({ messageId, userId, content });
  if ("error" in result) return result;
  emitRealtime(`conversation:${result.conversationId}`, "message:updated", result.message);
  if (result.isLatest) await pushPreview(result.conversationId);
  return { ok: true, message: result.message } as const;
}

/** Sender-initiated soft delete - moderation (hideMessage) uses the same field. */
export async function deleteOwnMessage(userId: string, messageId: string) {
  const result = await removeChatMessage({ messageId, userId });
  if ("error" in result) return result;
  emitRealtime(`conversation:${result.conversationId}`, "message:updated", result.message);
  if (result.isLatest) await pushPreview(result.conversationId);
  revalidateChatPaths();
  return { ok: true } as const;
}

export async function reactToMessage(userId: string, messageId: string, emoji: string) {
  const user = await getChatUser(userId);
  if (!user) return { error: "Forbidden" } as const;
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!message) return { error: "Not found" } as const;
  const access = await resolveAccess(user, message.conversationId);
  if (!access.ok || !access.canPost) return { error: "Forbidden" } as const;
  const result = await toggleReaction({ messageId, userId, emoji });
  if ("error" in result) return result;
  emitRealtime(`conversation:${result.conversationId}`, "message:updated", result.message);
  return { ok: true, message: result.message } as const;
}

export async function reportMessage(userId: string, messageId: string, reason: string | undefined) {
  const user = await getChatUser(userId);
  if (!user) return { error: "Forbidden" } as const;
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!message || !(await resolveAccess(user, message.conversationId)).ok) return { error: "Forbidden" } as const;
  return fileReport(notify, user, messageId, reason);
}

/** A moderator of the conversation (course instructors there, staff anywhere) removes a message. */
export async function hideMessage(actorId: string, messageId: string) {
  const user = await getChatUser(actorId);
  if (!user) return { error: "Forbidden" } as const;
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!message) return { error: "Not found" } as const;
  const access = await resolveAccess(user, message.conversationId);
  if (!access.ok || !access.canModerate) return { error: "Forbidden" } as const;

  const result = await removeChatMessage({ messageId, userId: actorId, moderator: true });
  if ("error" in result) return result;
  await logAudit(actorId, "message:moderate", "Message", messageId);
  emitRealtime(`conversation:${result.conversationId}`, "message:updated", result.message);
  if (result.isLatest) await pushPreview(result.conversationId);
  revalidatePath("/admin/messages");
  return { ok: true } as const;
}

export async function blockUserForChat(userId: string, targetId: string) {
  const user = await getChatUser(userId);
  if (!user) return { error: "Forbidden" } as const;
  return blockUser(realtimeBus, user, targetId);
}

export async function unblockUserForChat(userId: string, targetId: string) {
  const user = await getChatUser(userId);
  if (!user) return { error: "Forbidden" } as const;
  return unblockUser(realtimeBus, user, targetId);
}

/** Mutes notifications (not unread counts) until a time, or unmutes with null. */
export async function setConversationMuted(userId: string, conversationId: string, until: Date | null) {
  const { count } = await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId, removedAt: null },
    data: { mutedUntil: until },
  });
  if (count === 0) return { error: "Forbidden" } as const;
  const mutedUntil = until?.toISOString() ?? null;
  emitRealtime(`user:${userId}`, "conversation:updated", { conversationId, mutedUntil });
  return { ok: true, mutedUntil } as const;
}

/** Staff change a ticket; status changes leave a note in the thread and the customer's inbox updates. */
export async function updateSupportTicket(actorId: string, ticketId: string, input: Parameters<typeof updateTicket>[2]) {
  const user = await getChatUser(actorId);
  if (!user) return { error: "Forbidden" } as const;
  const result = await updateTicket(user, ticketId, input);
  if ("error" in result) return result;
  emitRealtime(rooms.staff, "ticket:updated", result.ticket);
  emitRealtime(`user:${result.requesterId}`, "conversation:updated", { conversationId: result.conversationId, ticket: result.ticket });
  if (result.note) {
    const sent = await sendChatMessage({ conversationId: result.conversationId, senderId: actorId, content: result.note, type: "SYSTEM", clientMsgId: `sys-${crypto.randomUUID()}` });
    if (!("error" in sent)) {
      emitRealtime(`conversation:${result.conversationId}`, "message:new", sent.message);
      const update = { conversationId: result.conversationId, lastSeq: sent.message.seq, lastMessageAt: sent.message.createdAt, preview: messagePreview(sent.message), senderId: actorId };
      for (const { userId, unread } of sent.recipients) emitRealtime(`user:${userId}`, "conversation:updated", { ...update, unread });
      emitRealtime(rooms.staff, "conversation:updated", update);
    }
  }
  if (result.notification) await notify([result.assigned!], result.notification);
  return { ok: true, ticket: result.ticket } as const;
}

export async function resolveMessageReport(actorId: string, reportId: string, action: "remove" | "dismiss") {
  const user = await getChatUser(actorId);
  if (!user) return { error: "Forbidden" } as const;
  const result = await resolveReport(user, reportId, action);
  if ("error" in result) return result;
  if (result.removed) {
    emitRealtime(`conversation:${result.removed.conversationId}`, "message:updated", result.removed);
    await pushPreview(result.removed.conversationId);
  }
  revalidatePath("/admin/messages");
  return { ok: true } as const;
}

/** Unread per conversation, which of them are muted, and the total (muted ones don't count). */
export async function unreadSummary(userId: string) {
  const rows = await prisma.conversationParticipant.findMany({
    where: { userId, removedAt: null },
    select: { conversationId: true, lastReadSeq: true, mutedUntil: true, conversation: { select: { lastSeq: true } } },
  });
  const now = Date.now();
  const conversations: Record<string, number> = {};
  const muted: string[] = [];
  let total = 0;
  for (const row of rows) {
    const isMuted = !!row.mutedUntil && row.mutedUntil.getTime() > now;
    if (isMuted) muted.push(row.conversationId);
    const unread = Math.max(0, row.conversation.lastSeq - row.lastReadSeq);
    if (unread === 0) continue;
    conversations[row.conversationId] = unread;
    if (!isMuted) total += unread;
  }
  return { total, conversations, muted };
}

export { blockStateBetween, canModerateChat };
