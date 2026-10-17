/*
 * Chat messages, shared by the Next.js app (REST, server actions) and the socket server. No
 * next/* or "server-only" imports: the socket server runs this file in a plain Node process.
 * Callers check access (resolveAccess in access.ts) before calling in here.
 *
 * Every message takes the next seq in its conversation; a member's lastReadSeq is the newest seq
 * they have seen. Unread is lastSeq - lastReadSeq, and a reconnecting client asks for "everything
 * after seq N" instead of reloading the conversation.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { markGroupRead, type NotifyInput } from "@/server/notifications/notify";
import { applyTicketOnMessage, serializeTicket, type TicketEvent, type TicketRow, type TicketWire } from "./support";

export const MESSAGE_MAX_LENGTH = 2000;
/** Most messages one catch-up returns; past that the client reloads the newest page instead. */
export const SYNC_LIMIT = 200;
/** Own messages can be edited for this long after sending. */
export const MESSAGE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** The reactions people can add. A short fixed set keeps rows small and the picker quick. */
export const CHAT_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "✅"] as const;

export const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true } },
  replyTo: { select: { id: true, seq: true, content: true, deletedAt: true, sender: { select: { name: true } } } },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.MessageInclude;

export type ChatMessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export type ChatReaction = { emoji: string; count: number; userIds: string[] };

/** What leaves the server: the row, with removed text blanked and reactions grouped by emoji. */
export type ChatMessageWire = {
  id: string;
  seq: number;
  conversationId: string;
  senderId: string;
  clientMsgId: string | null;
  type: "TEXT" | "SYSTEM";
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  /** Removed by a moderator rather than by the sender. */
  removedByModerator: boolean;
  sender: { id: string; name: string | null };
  replyTo: { id: string; seq: number; senderName: string | null; preview: string; deleted: boolean } | null;
  reactions: ChatReaction[];
};

/** A removed message keeps its row (and seq), but its text never leaves the server except to
 * moderators - showing "Message removed" in the browser isn't enough if the JSON still has it. */
export function hideRemovedContent<T extends { content: string; deletedAt: Date | null }>(message: T): T {
  return message.deletedAt ? { ...message, content: "" } : message;
}

export const messagePreview = (message: { content: string; deletedAt: Date | null }) =>
  message.deletedAt ? "Message removed" : message.content.slice(0, 140);

function groupReactions(rows: { emoji: string; userId: string }[]): ChatReaction[] {
  const byEmoji = new Map<string, string[]>();
  for (const row of rows) byEmoji.set(row.emoji, [...(byEmoji.get(row.emoji) ?? []), row.userId]);
  return [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

/** `moderator` keeps removed text (staff reviewing a report); a room broadcast never does. */
export function serializeMessage(row: ChatMessageRow, { moderator = false } = {}): ChatMessageWire {
  const deleted = !!row.deletedAt;
  return {
    id: row.id,
    seq: row.seq,
    conversationId: row.conversationId,
    senderId: row.senderId,
    clientMsgId: row.clientMsgId,
    type: row.type,
    content: deleted && !moderator ? "" : row.content,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    removedByModerator: deleted && !!row.deletedById && row.deletedById !== row.senderId,
    sender: { id: row.sender.id, name: row.sender.name },
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          seq: row.replyTo.seq,
          senderName: row.replyTo.sender.name,
          preview: row.replyTo.deletedAt ? "" : row.replyTo.content.slice(0, 140),
          deleted: !!row.replyTo.deletedAt,
        }
      : null,
    reactions: deleted ? [] : groupReactions(row.reactions),
  };
}

function isUniqueViolation(err: unknown, field: string) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta ?? {}).includes(field)
  );
}

class ChatInputError extends Error {}

export type ConversationInfo = {
  type: "DIRECT" | "COURSE_GROUP" | "SUPPORT";
  uniqueKey: string | null;
  courseTitle: string | null;
  channel: "GENERAL" | "ANNOUNCEMENTS" | "QA" | "BATCH" | null;
  title: string | null;
};

export type SentMessage = {
  ok: true;
  message: ChatMessageWire;
  duplicate: boolean;
  recipients: { userId: string; unread: number }[];
  conversation: ConversationInfo;
  /** For SUPPORT threads: the ticket after this message, and what the message did to it. */
  ticket: TicketWire | null;
  ticketEvent: TicketEvent | null;
};

/**
 * Saves a message with the conversation's next seq. Incrementing lastSeq locks the conversation
 * row, so concurrent senders queue up and get consecutive numbers. With a clientMsgId, a retry of
 * a send that already landed (lost ack, reconnect) returns the saved message with
 * `duplicate: true` rather than posting it twice.
 *
 * Returns the other members with their unread counts, for the caller to push live updates.
 */
export async function sendChatMessage({
  conversationId,
  senderId,
  content,
  clientMsgId,
  replyToId,
  type = "TEXT",
}: {
  conversationId: string;
  senderId: string;
  content: string;
  clientMsgId?: string | null;
  replyToId?: string | null;
  type?: "TEXT" | "SYSTEM";
}): Promise<SentMessage | { ok?: undefined; error: string }> {
  const text = content.trim();
  if (!text) return { error: "Message cannot be empty" } as const;
  if (text.length > MESSAGE_MAX_LENGTH) return { error: "Message is too long" } as const;

  const findSent = async (): Promise<SentMessage | null> => {
    if (!clientMsgId) return null;
    const row = await prisma.message.findUnique({ where: { senderId_clientMsgId: { senderId, clientMsgId } }, include: MESSAGE_INCLUDE });
    if (!row) return null;
    const info = await conversationInfo(row.conversationId);
    return { ok: true, message: serializeMessage(row), duplicate: true, recipients: [], conversation: info, ticket: null, ticketEvent: null };
  };
  const earlier = await findSent();
  if (earlier) return earlier;

  const now = new Date();
  let saved: { row: ChatMessageRow; conversation: ConversationInfo; ticket: TicketRow | null; ticketEvent: TicketEvent | null };
  try {
    saved = await prisma.$transaction(async (tx) => {
      if (replyToId) {
        const parent = await tx.message.findFirst({ where: { id: replyToId, conversationId }, select: { id: true } });
        if (!parent) throw new ChatInputError("The message you replied to no longer exists");
      }
      const { lastSeq: seq, ...info } = await tx.conversation.update({
        where: { id: conversationId },
        data: { lastSeq: { increment: 1 }, lastMessageAt: now },
        select: { lastSeq: true, type: true, uniqueKey: true, channel: true, title: true, course: { select: { title: true } } },
      });
      const conversation: ConversationInfo = {
        type: info.type,
        uniqueKey: info.uniqueKey,
        courseTitle: info.course?.title ?? null,
        channel: info.channel,
        title: info.title,
      };
      const row = await tx.message.create({
        data: { conversationId, senderId, content: text, seq, clientMsgId: clientMsgId || null, replyToId: replyToId ?? null, type, createdAt: now },
        include: MESSAGE_INCLUDE,
      });
      // Your own message is read. Course group members only get a row once they take part.
      await tx.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId: senderId } },
        create: { conversationId, userId: senderId, lastReadSeq: seq, lastReadAt: now },
        update: { lastReadSeq: seq, lastReadAt: now },
      });
      const ticketChange =
        conversation.type === "SUPPORT" && type === "TEXT" ? await applyTicketOnMessage(tx, conversationId, senderId, text, now) : null;
      return { row, conversation, ticket: ticketChange?.ticket ?? null, ticketEvent: ticketChange?.event ?? null };
    });
  } catch (err) {
    if (err instanceof ChatInputError) return { error: err.message } as const;
    // Two copies of the same send raced and the other one won: return what it saved.
    if (isUniqueViolation(err, "clientMsgId")) {
      const raced = await findSent();
      if (raced) return raced;
    }
    throw err;
  }

  const members = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: senderId }, removedAt: null },
    select: { userId: true, lastReadSeq: true },
  });
  const recipients = members.map((m) => ({ userId: m.userId, unread: Math.max(0, saved.row.seq - m.lastReadSeq) }));
  return {
    ok: true,
    message: serializeMessage(saved.row),
    duplicate: false,
    recipients,
    conversation: saved.conversation,
    ticket: saved.ticket ? serializeTicket(saved.ticket) : null,
    ticketEvent: saved.ticketEvent,
  };
}

async function conversationInfo(conversationId: string): Promise<ConversationInfo> {
  const c = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { type: true, uniqueKey: true, channel: true, title: true, course: { select: { title: true } } },
  });
  return { type: c.type, uniqueKey: c.uniqueKey, courseTitle: c.course?.title ?? null, channel: c.channel, title: c.title };
}

export function conversationLabel(conversation: ConversationInfo) {
  if (conversation.type === "SUPPORT") return "Support";
  if (conversation.type !== "COURSE_GROUP") return "Direct message";
  const course = conversation.courseTitle ?? "your course";
  switch (conversation.channel) {
    case "ANNOUNCEMENTS":
      return `${course} · #announcements`;
    case "QA":
      return `${course} · #q-and-a`;
    case "BATCH":
      return `${course} · ${conversation.title ?? "batch"}`;
    default:
      return course;
  }
}

/** One collapsing notification per conversation: "Naima sent you a message", then a count. */
export function messageNotification(conversationId: string, conversation: ConversationInfo, message: ChatMessageWire): NotifyInput {
  const sender = message.sender.name ?? "Someone";
  const announcement = conversation.type === "COURSE_GROUP" && conversation.channel === "ANNOUNCEMENTS";
  return {
    type: announcement ? "announcement" : "message",
    title: announcement
      ? `${sender} posted an announcement in ${conversation.courseTitle ?? "your course"}`
      : conversation.type === "COURSE_GROUP"
        ? `New messages in ${conversationLabel(conversation)}`
        : conversation.type === "SUPPORT"
          ? "New message about your support request"
          : `${sender} sent you a message`,
    body: `${sender}: ${messagePreview(message)}`,
    link: `/messages?c=${conversationId}`,
    actorId: message.senderId,
    entity: { type: "Conversation", id: conversationId },
    groupKey: `conversation:${conversationId}`,
  };
}

/** The person who opened a support thread ("support:<userId>"), or null for other conversations. */
export function supportRequester(conversation: ConversationInfo) {
  return conversation.type === "SUPPORT" && conversation.uniqueKey?.startsWith("support:")
    ? conversation.uniqueKey.slice("support:".length)
    : null;
}

/** Active admins and support agents - who answers support requests. */
export async function staffUserIds() {
  const staff = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["ADMIN", "SUPER_ADMIN", "SUPPORT"] } } } } },
    select: { id: true },
  });
  return staff.map((u) => u.id);
}

/**
 * After a message is saved: tells the other members (minus anyone already looking at the
 * conversation and anyone who muted it), and for a customer's support message, the ticket's
 * assignee - or every staff member while it's unassigned. `notify` is the calling process's
 * notifier (see createNotifier).
 */
export async function notifyAboutMessage(
  notify: (userIds: string[], input: NotifyInput) => Promise<unknown>,
  sent: Pick<SentMessage, "message" | "recipients" | "conversation"> & Partial<Pick<SentMessage, "ticket" | "ticketEvent">>,
  { viewing = new Set<string>() }: { viewing?: Set<string> } = {}
) {
  const { message, conversation } = sent;
  const conversationId = message.conversationId;
  const members = sent.recipients.map((r) => r.userId);
  const muted = members.length
    ? await prisma.conversationParticipant.findMany({
        where: { conversationId, userId: { in: members }, mutedUntil: { gt: new Date() } },
        select: { userId: true },
      })
    : [];
  const skip = new Set([...viewing, ...muted.map((m) => m.userId)]);

  // A customer's message on a support thread alerts staff as ticket work (with the ticket's state
  // and link) rather than as a plain chat message - the assignee alone while it is theirs, everyone
  // when it is unassigned or just reopened.
  const requester = supportRequester(conversation) ?? sent.ticket?.requester.id ?? null;
  const staffAlerted = new Set<string>();
  if (requester === message.senderId) {
    const assignee = sent.ticketEvent === "reopened" ? null : (sent.ticket?.assignee?.id ?? null);
    for (const id of assignee ? [assignee] : await staffUserIds()) if (!viewing.has(id)) staffAlerted.add(id);
  }
  await notify(
    members.filter((id) => !skip.has(id) && !staffAlerted.has(id)),
    messageNotification(conversationId, conversation, message)
  );

  if (staffAlerted.size > 0) {
    const who = message.sender.name ?? "a student";
    await notify(
      [...staffAlerted],
      {
        type: "support_request",
        title:
          sent.ticketEvent === "reopened"
            ? `${who} reopened their support ticket`
            : sent.ticketEvent === "replied"
              ? `${who} replied on their support ticket`
              : `Support request from ${who}`,
        body: messagePreview(message),
        link: `/admin/messages?tab=tickets&c=${conversationId}`,
        actorId: message.senderId,
        entity: { type: "Conversation", id: conversationId },
        groupKey: `support:${conversationId}`,
      }
    );
  }
}

/**
 * Marks everything up to `seq` (default: the newest message) as read. Only ever moves forward, so
 * a late "read up to 4" can't undo a "read up to 9" from another tab. Returns the member's
 * lastReadSeq afterwards and how many messages are still unread.
 */
export async function markChatRead(conversationId: string, userId: string, seq?: number) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { lastSeq: true } });
  if (!conversation) return { error: "Not found" } as const;
  const target = Math.max(0, Math.min(seq ?? conversation.lastSeq, conversation.lastSeq));
  const now = new Date();

  const { count } = await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId, lastReadSeq: { lt: target } },
    data: { lastReadSeq: target, lastReadAt: now },
  });
  if (count === 0) {
    // Either nothing new to mark, or no row yet (a course group member reading for the first time).
    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, lastReadSeq: target, lastReadAt: now },
      update: {},
    });
  }
  const member = await prisma.conversationParticipant.findUniqueOrThrow({
    where: { conversationId_userId: { conversationId, userId } },
    select: { lastReadSeq: true },
  });
  // Caught up: the conversation's "new message" notification has done its job.
  const notifications =
    member.lastReadSeq >= conversation.lastSeq
      ? await markGroupRead(userId, `conversation:${conversationId}`)
      : { cleared: 0, unreadCount: null };
  return {
    ok: true,
    lastReadSeq: member.lastReadSeq,
    unread: conversation.lastSeq - member.lastReadSeq,
    notifications,
  } as const;
}

/**
 * Catch-up after a reconnect: the messages after `afterSeq`, oldest first, plus - with `since` -
 * recent messages edited, removed or reacted to since the client's last sync. When more than
 * SYNC_LIMIT arrived meanwhile, `reset` tells the client to reload the newest page instead.
 */
export async function listMessagesAfter(
  conversationId: string,
  afterSeq: number,
  { moderator = false, since }: { moderator?: boolean; since?: Date | null } = {}
) {
  const rows = await prisma.message.findMany({
    where: { conversationId, seq: { gt: afterSeq } },
    orderBy: { seq: "asc" },
    take: SYNC_LIMIT + 1,
    include: MESSAGE_INCLUDE,
  });
  const reset = rows.length > SYNC_LIMIT;
  const messages = rows.slice(0, SYNC_LIMIT).map((row) => serializeMessage(row, { moderator }));
  const changed = since
    ? (
        await prisma.message.findMany({
          where: {
            conversationId,
            seq: { gt: Math.max(0, afterSeq - 500), lte: afterSeq },
            OR: [{ editedAt: { gt: since } }, { deletedAt: { gt: since } }, { reactions: { some: { createdAt: { gt: since } } } }],
          },
          orderBy: { seq: "asc" },
          take: 100,
          include: MESSAGE_INCLUDE,
        })
      ).map((row) => serializeMessage(row, { moderator }))
    : [];
  return { messages, changed, reset };
}

/** One page of history, oldest first for display; `beforeSeq` pages back from the oldest shown. */
export async function listMessagePage(
  conversationId: string,
  { beforeSeq, limit = 50, moderator = false }: { beforeSeq?: number; limit?: number; moderator?: boolean } = {}
) {
  const newestFirst = await prisma.message.findMany({
    where: { conversationId, ...(beforeSeq ? { seq: { lt: beforeSeq } } : {}) },
    orderBy: { seq: "desc" },
    take: limit + 1,
    include: MESSAGE_INCLUDE,
  });
  const hasMore = newestFirst.length > limit;
  const page = newestFirst.slice(0, limit).reverse();
  return { messages: page.map((row) => serializeMessage(row, { moderator })), hasMore };
}

async function loadMessage(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: { ...MESSAGE_INCLUDE, conversation: { select: { lastSeq: true, type: true } } },
  });
}

/**
 * The sender rewrites their own message (within MESSAGE_EDIT_WINDOW_MS). Returns the updated
 * message for the caller to broadcast as "message:updated", and whether it is the conversation's
 * newest (so inbox previews need refreshing).
 */
export async function editChatMessage({ messageId, userId, content }: { messageId: string; userId: string; content: string }) {
  const text = content.trim();
  if (!text) return { error: "Message cannot be empty" } as const;
  if (text.length > MESSAGE_MAX_LENGTH) return { error: "Message is too long" } as const;

  const row = await loadMessage(messageId);
  if (!row || row.senderId !== userId || row.type !== "TEXT") return { error: "Forbidden" } as const;
  if (row.deletedAt) return { error: "This message was removed" } as const;
  if (Date.now() - row.createdAt.getTime() > MESSAGE_EDIT_WINDOW_MS) return { error: "Messages can only be edited for 24 hours" } as const;

  const updated =
    row.content === text
      ? row
      : await prisma.message.update({ where: { id: messageId }, data: { content: text, editedAt: new Date() }, include: MESSAGE_INCLUDE });
  return { ok: true, message: serializeMessage(updated), isLatest: row.seq === row.conversation.lastSeq, conversationId: row.conversationId } as const;
}

/**
 * Soft-removes a message: the sender's own, or any message when `moderator` (the caller checked
 * canModerate for that conversation). Text stays in the row for staff but never leaves again.
 */
export async function removeChatMessage({ messageId, userId, moderator = false }: { messageId: string; userId: string; moderator?: boolean }) {
  const row = await loadMessage(messageId);
  if (!row) return { error: "Not found" } as const;
  const own = row.senderId === userId;
  if (!own && !moderator) return { error: "Forbidden" } as const;
  const updated = row.deletedAt
    ? row
    : await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), deletedById: userId }, include: MESSAGE_INCLUDE });
  return {
    ok: true,
    message: serializeMessage(updated),
    byModerator: !own,
    isLatest: row.seq === row.conversation.lastSeq,
    conversationId: row.conversationId,
  } as const;
}

/** Adds the reaction, or takes it back if the user already reacted with that emoji. */
export async function toggleReaction({ messageId, userId, emoji }: { messageId: string; userId: string; emoji: string }) {
  if (!(CHAT_REACTIONS as readonly string[]).includes(emoji)) return { error: "Unknown reaction" } as const;
  const row = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, deletedAt: true } });
  if (!row) return { error: "Not found" } as const;
  if (row.deletedAt) return { error: "This message was removed" } as const;

  const key = { messageId_userId_emoji: { messageId, userId, emoji } };
  const existing = await prisma.messageReaction.findUnique({ where: key, select: { id: true } });
  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } }).catch(() => {});
  } else {
    await prisma.messageReaction.create({ data: { messageId, userId, emoji } }).catch((err) => {
      if (!isUniqueViolation(err, "emoji")) throw err;
    });
  }
  const updated = await prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: MESSAGE_INCLUDE });
  return { ok: true, message: serializeMessage(updated), conversationId: row.conversationId } as const;
}

/** The conversation's newest message, for inbox previews after an edit or removal. */
export async function latestPreview(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { lastSeq: true, lastMessageAt: true } });
  if (!conversation || conversation.lastSeq === 0) return null;
  const last = await prisma.message.findUnique({
    where: { conversationId_seq: { conversationId, seq: conversation.lastSeq } },
    select: { content: true, deletedAt: true, senderId: true },
  });
  if (!last) return null;
  return { conversationId, lastSeq: conversation.lastSeq, lastMessageAt: conversation.lastMessageAt, preview: messagePreview(last), senderId: last.senderId };
}

/** Members of a conversation (not removed), for pushing inbox updates to each of them. */
export async function memberIds(conversationId: string) {
  const rows = await prisma.conversationParticipant.findMany({ where: { conversationId, removedAt: null }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

/** Sorted user ids, so A->B and B->A share one key and one conversation. */
export const directKey = (a: string, b: string) => `direct:${[a, b].sort().join(":")}`;

/**
 * Finds the conversation for `uniqueKey`, creating it if needed. Two concurrent opens both try to
 * create; the loser's unique-key violation is caught and it returns the winner's conversation.
 */
export async function findOrCreateConversation(
  uniqueKey: string,
  create: () => Promise<{ id: string }>
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.conversation.findUnique({ where: { uniqueKey }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  try {
    return { id: (await create()).id, created: true };
  } catch (err) {
    if (!isUniqueViolation(err, "uniqueKey")) throw err;
    const winner = await prisma.conversation.findUniqueOrThrow({ where: { uniqueKey }, select: { id: true } });
    return { id: winner.id, created: false };
  }
}
