/*
 * Chat messages, shared by the Next.js app (REST, server actions) and the socket server. No
 * next/* or "server-only" imports: the socket server runs this file in a plain Node process.
 * Callers check access (canAccessConversation) before calling in here.
 *
 * Every message takes the next seq in its conversation; a member's lastReadSeq is the newest seq
 * they have seen. Unread is lastSeq - lastReadSeq, and a reconnecting client asks for "everything
 * after seq N" instead of reloading the conversation.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { markGroupRead, type NotifyInput } from "@/server/notifications/notify";

export const MESSAGE_MAX_LENGTH = 2000;
/** Most messages one catch-up returns; past that the client reloads the newest page instead. */
export const SYNC_LIMIT = 200;

const SENDER = { sender: { select: { id: true, name: true } } } as const;

export type ChatMessageRow = Prisma.MessageGetPayload<{ include: typeof SENDER }>;

/** A removed message keeps its row (and seq), but its text never leaves the server except to
 * moderators - showing "Message removed" in the browser isn't enough if the JSON still has it. */
export function hideRemovedContent<T extends { content: string; deletedAt: Date | null }>(message: T): T {
  return message.deletedAt ? { ...message, content: "" } : message;
}

export const messagePreview = (message: { content: string; deletedAt: Date | null }) =>
  message.deletedAt ? "Message removed" : message.content.slice(0, 140);

function isUniqueViolation(err: unknown, field: string) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta ?? {}).includes(field)
  );
}

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
}: {
  conversationId: string;
  senderId: string;
  content: string;
  clientMsgId?: string | null;
}) {
  const text = content.trim();
  if (!text) return { error: "Message cannot be empty" } as const;
  if (text.length > MESSAGE_MAX_LENGTH) return { error: "Message is too long" } as const;

  const findSent = () =>
    clientMsgId
      ? prisma.message.findUnique({ where: { senderId_clientMsgId: { senderId, clientMsgId } }, include: SENDER })
      : null;
  const earlier = await findSent();
  if (earlier) return { ok: true, message: earlier, duplicate: true, recipients: [] } as const;

  const now = new Date();
  let message: ChatMessageRow;
  let conversation: ConversationInfo;
  try {
    message = await prisma.$transaction(async (tx) => {
      const { lastSeq: seq, ...info } = await tx.conversation.update({
        where: { id: conversationId },
        data: { lastSeq: { increment: 1 }, lastMessageAt: now },
        select: { lastSeq: true, type: true, uniqueKey: true, course: { select: { title: true } } },
      });
      conversation = { type: info.type, uniqueKey: info.uniqueKey, courseTitle: info.course?.title ?? null };
      const created = await tx.message.create({
        data: { conversationId, senderId, content: text, seq, clientMsgId: clientMsgId || null, createdAt: now },
        include: SENDER,
      });
      // Your own message is read. Course group members only get a row once they take part.
      await tx.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId: senderId } },
        create: { conversationId, userId: senderId, lastReadSeq: seq, lastReadAt: now },
        update: { lastReadSeq: seq, lastReadAt: now },
      });
      return created;
    });
  } catch (err) {
    // Two copies of the same send raced and the other one won: return what it saved.
    if (isUniqueViolation(err, "clientMsgId")) {
      const saved = await findSent();
      if (saved) return { ok: true, message: saved, duplicate: true, recipients: [] } as const;
    }
    throw err;
  }

  const members = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: senderId } },
    select: { userId: true, lastReadSeq: true },
  });
  const recipients = members.map((m) => ({ userId: m.userId, unread: Math.max(0, message.seq - m.lastReadSeq) }));
  return { ok: true, message, duplicate: false, recipients, conversation: conversation! } as const;
}

type ConversationInfo = {
  type: "DIRECT" | "COURSE_GROUP" | "SUPPORT";
  uniqueKey: string | null;
  courseTitle: string | null;
};

/** One collapsing notification per conversation: "Naima sent you a message", then a count. */
export function messageNotification(
  conversationId: string,
  conversation: ConversationInfo,
  message: ChatMessageRow
): NotifyInput {
  const sender = message.sender.name ?? "Someone";
  return {
    type: "message",
    title:
      conversation.type === "COURSE_GROUP"
        ? `New messages in ${conversation.courseTitle ?? "your course group"}`
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
 * conversation), and when a student writes to support, every staff member who isn't in the thread
 * yet. `notify` is the calling process's notifier (see createNotifier).
 */
export async function notifyAboutMessage(
  notify: (userIds: string[], input: NotifyInput) => Promise<unknown>,
  sent: { message: ChatMessageRow; recipients: { userId: string }[]; conversation: ConversationInfo },
  { viewing = new Set<string>() }: { viewing?: Set<string> } = {}
) {
  const { message, conversation } = sent;
  const conversationId = message.conversationId;
  const members = sent.recipients.map((r) => r.userId);
  await notify(members.filter((id) => !viewing.has(id)), messageNotification(conversationId, conversation, message));

  if (supportRequester(conversation) === message.senderId) {
    const inThread = new Set(members);
    const staff = (await staffUserIds()).filter((id) => !inThread.has(id) && !viewing.has(id));
    await notify(staff, {
      type: "support_request",
      title: `Support request from ${message.sender.name ?? "a student"}`,
      body: messagePreview(message),
      link: `/messages?c=${conversationId}`,
      actorId: message.senderId,
      entity: { type: "Conversation", id: conversationId },
      groupKey: `support:${conversationId}`,
    });
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
 * Catch-up after a reconnect: the messages after `afterSeq`, oldest first. When more than
 * SYNC_LIMIT arrived meanwhile, `reset` tells the client to reload the newest page instead.
 */
export async function listMessagesAfter(conversationId: string, afterSeq: number, { moderator = false } = {}) {
  const rows = await prisma.message.findMany({
    where: { conversationId, seq: { gt: afterSeq } },
    orderBy: { seq: "asc" },
    take: SYNC_LIMIT + 1,
    include: SENDER,
  });
  const reset = rows.length > SYNC_LIMIT;
  const messages = rows.slice(0, SYNC_LIMIT);
  return { messages: moderator ? messages : messages.map(hideRemovedContent), reset };
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
    include: SENDER,
  });
  const hasMore = newestFirst.length > limit;
  const page = newestFirst.slice(0, limit).reverse();
  return { messages: moderator ? page : page.map(hideRemovedContent), hasMore };
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
