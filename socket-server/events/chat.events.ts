import { prisma } from "@/lib/prisma";
import {
  editMessageSchema,
  messageIdSchema,
  reactMessageSchema,
  readMessagesSchema,
  sendMessageSchema,
  syncMessagesSchema,
} from "@/lib/validations/chat";
import { isStaff } from "@/server/chat/access";
import { messagePreview, notifyAboutMessage } from "@/server/chat/messages";
import { createNotifier, type Notifier } from "@/server/notifications/notify";
import { rooms } from "@/server/realtime/bus";
import type { BucketName } from "@/server/realtime/rate-limit";
import {
  editChatMessage,
  latestPreview,
  listMessagesAfter,
  markChatRead,
  memberIds,
  persistMessage,
  removeChatMessage,
  toggleReaction,
} from "../chat-store";
import type { GatewayContext, GatewaySocket } from "../context";

const conversationRoom = rooms.conversation;

const TYPING_THROTTLE_MS = 2_000;
const MAX_PRESENCE_QUERY = 200;

type Ack = (res: { error?: string; [key: string]: unknown }) => void;

/**
 * Every async handler below hits the database. Socket.IO doesn't catch a listener's rejected
 * promise, so a single DB hiccup became an unhandled rejection (which takes the whole socket
 * process down under Node's default mode) and the sender's ack never fired. Log it and ack an
 * error instead.
 */
function safely<Args extends unknown[]>(event: string, handler: (...args: Args) => Promise<unknown>) {
  return async (...args: Args) => {
    try {
      await handler(...args);
    } catch (err) {
      console.error(`Socket ${event} failed:`, err instanceof Error ? err.message : "unknown error");
      const ack = args[args.length - 1];
      if (typeof ack === "function") (ack as Ack)({ error: "Something went wrong - please try again" });
    }
  };
}

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

/** notify() for the socket server: rows plus a direct emit to the user's room (any node, via the
 * adapter). Email and push go to the worker's queue; without Redis there is no worker, so the
 * gateway sends neither (the web app still does for what it originates). */
const notifiers = new WeakMap<GatewayContext, Notifier>();
function notifierFor(ctx: GatewayContext) {
  let notify = notifiers.get(ctx);
  if (!notify) {
    const { io, queue } = ctx;
    notify = createNotifier({
      push: (userId, event, payload) => io.to(rooms.user(userId)).emit(event, payload),
      enqueue: queue ? (kind, job) => queue.add(kind, job).then(() => true, () => false) : undefined,
    });
    notifiers.set(ctx, notify);
  }
  return notify;
}

/** People this user shares a conversation with - the only ones whose presence they may see. */
async function contactIdsAmong(userId: string, candidateIds: string[]) {
  if (candidateIds.length === 0) return [];
  const rows = await prisma.conversationParticipant.findMany({
    where: { userId: { in: candidateIds }, removedAt: null, conversation: { participants: { some: { userId, removedAt: null } } } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.map((r) => r.userId);
}

export function registerChatEvents(ctx: GatewayContext, socket: GatewaySocket) {
  const { io, presence, limiter, access } = ctx;

  /** The current user if they're still active and within their rate limit; acks the reason otherwise. */
  async function gate(bucket: BucketName, ack?: Ack) {
    const user = await ctx.users.fresh(socket);
    if (!user) return null;
    const limit = await limiter.take(bucket, user.id);
    if (!limit.allowed) {
      ack?.({ error: bucket === "message" ? "You're sending messages too fast" : "Too many requests - slow down" });
      return null;
    }
    return user;
  }

  /** Inbox updates for every member after an edit or removal of the newest message. */
  async function pushPreview(conversationId: string) {
    const preview = await latestPreview(conversationId);
    if (!preview) return;
    for (const id of await memberIds(conversationId)) io.to(rooms.user(id)).emit("conversation:updated", preview);
  }

  socket.on(
    "conversation:join",
    safely("conversation:join", async (conversationId: unknown, ack?: Ack) => {
      if (!isId(conversationId)) return ack?.({ error: "Invalid conversation" });
      const user = await gate("read", ack);
      if (!user) return;
      const result = await access.get(user, conversationId);
      if (!result.ok) return ack?.({ error: result.reason === "not_found" ? "Conversation not found" : "Forbidden" });

      const room = conversationRoom(conversationId);
      socket.join(room);
      socket.to(room).emit("user:online", { userId: user.id });
      if (socket.data.viewingRequested === conversationId && socket.data.viewing !== conversationId) {
        socket.data.viewing = conversationId;
        await presence.touchViewing([{ userId: user.id, conversationId }]);
      }
      // Who else is online, from the presence keys - so it holds across nodes, not just this one.
      const members = await prisma.conversationParticipant.findMany({
        where: { conversationId, removedAt: null, userId: { not: user.id } },
        select: { userId: true },
        take: 500,
      });
      const online = await presence.onlineAmong(members.map((m) => m.userId));
      for (const otherId of online) socket.emit("user:online", { userId: otherId });
      ack?.({ online: [...online], lastSeq: result.conversation.lastSeq, lastReadSeq: result.lastReadSeq });
    })
  );

  socket.on(
    "conversation:leave",
    safely("conversation:leave", async (conversationId: unknown) => {
      if (!isId(conversationId)) return;
      socket.leave(conversationRoom(conversationId));
      if (socket.data.viewing === conversationId) {
        socket.data.viewing = null;
        await presence.stopViewing(socket.data.user.id, conversationId);
      }
    })
  );

  /** Which conversation this tab has on screen (null when hidden): nobody gets a notification for
   * the conversation they are looking at. Only a joined room (access already checked) counts. */
  socket.on(
    "conversation:viewing",
    safely("conversation:viewing", async (conversationId: unknown) => {
      const userId = socket.data.user.id;
      const previous = socket.data.viewing;
      socket.data.viewingRequested = isId(conversationId) ? conversationId : null;
      const next = isId(conversationId) && socket.rooms.has(conversationRoom(conversationId)) ? conversationId : null;
      socket.data.viewing = next;
      if (previous && previous !== next) {
        const otherTab = [...io.of("/").sockets.values()].some(
          (s) => s.id !== socket.id && s.data.user?.id === userId && s.data.viewing === previous
        );
        if (!otherTab) await presence.stopViewing(userId, previous);
      }
      if (next) await presence.touchViewing([{ userId, conversationId: next }]);
    })
  );

  /**
   * The ack carries the saved message (with its seq), which replaces the sender's pending copy.
   * A retry with the same clientMsgId is acked with the original and not broadcast again.
   */
  socket.on(
    "message:send",
    safely("message:send", async (payload: unknown, ack?: Ack) => {
      const user = await gate("message", ack);
      if (!user) return;
      const parsed = sendMessageSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ error: parsed.error.issues[0].message });

      const { conversationId, content, clientMsgId, replyToId } = parsed.data;
      const allowed = await access.get(user, conversationId);
      if (!allowed.ok) return ack?.({ error: "Forbidden" });
      if (!allowed.canPost) return ack?.({ error: allowed.postingBlockedReason ?? "You can't post in this conversation" });
      if (allowed.conversation.slowModeSec > 0 && !allowed.canModerate) {
        const recent = await prisma.message.findFirst({
          where: { conversationId, senderId: user.id, createdAt: { gt: new Date(Date.now() - allowed.conversation.slowModeSec * 1000) } },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
        });
        if (recent) {
          const wait = Math.ceil((recent.createdAt.getTime() + allowed.conversation.slowModeSec * 1000 - Date.now()) / 1000);
          return ack?.({ error: `Slow mode is on - you can post again in ${wait}s` });
        }
      }

      const result = await persistMessage(conversationId, user.id, content, clientMsgId, replyToId);
      if ("error" in result) return ack?.({ error: result.error });
      const { message } = result;

      if (!result.duplicate) {
        io.to(conversationRoom(conversationId)).emit("message:new", message);
        const update = {
          conversationId,
          lastSeq: message.seq,
          lastMessageAt: message.createdAt,
          preview: messagePreview(message),
          senderId: user.id,
          ...(result.ticket ? { ticket: result.ticket } : {}),
        };
        // Every member's inbox (all their tabs) moves this conversation up, with their unread count.
        for (const { userId: recipientId, unread } of result.recipients) {
          io.to(rooms.user(recipientId)).emit("conversation:updated", { ...update, unread });
        }
        io.to(rooms.user(user.id)).emit("conversation:updated", { ...update, unread: 0 });
        if (result.conversation.type === "SUPPORT") {
          // Staff aren't members of tickets; the shared queue hears about every message.
          io.to(rooms.staff).emit("conversation:updated", update);
          if (result.ticket) io.to(rooms.staff).emit("ticket:updated", result.ticket);
        }
      }
      ack?.({ message });

      if (!result.duplicate) {
        // Whoever has this conversation on screen already sees the message - no notification for
        // them. Checked against the presence keys, so it holds for tabs on other nodes too.
        const members = result.recipients.map((r) => r.userId);
        const viewing = await presence.viewing(members.map((userId) => ({ userId, conversationId })));
        const viewingIds = new Set(members.filter((_, i) => viewing[i]));
        await notifyAboutMessage(notifierFor(ctx), result, { viewing: viewingIds });
      }
    })
  );

  /** Moves the reader's lastReadSeq forward. Their other tabs clear the unread badge, and the
   * room learns how far they've read (a DM shows "Seen" from it) - no per-message receipts. */
  socket.on(
    "message:read",
    safely("message:read", async (payload: unknown) => {
      const parsed = readMessagesSchema.safeParse(typeof payload === "string" ? { conversationId: payload } : payload);
      if (!parsed.success) return;
      const user = await gate("read");
      if (!user) return;
      const { conversationId, seq } = parsed.data;
      const allowed = await access.get(user, conversationId);
      if (!allowed.ok || !allowed.isParticipant) return;

      const result = await markChatRead(conversationId, user.id, seq);
      if ("error" in result) return;
      io.to(rooms.user(user.id)).emit("conversation:updated", { conversationId, unread: result.unread });
      if (result.notifications.cleared > 0) {
        io.to(rooms.user(user.id)).emit("notification:read", {
          groupKey: `conversation:${conversationId}`,
          unreadCount: result.notifications.unreadCount,
        });
      }
      socket.to(conversationRoom(conversationId)).emit("conversation:read", { conversationId, userId: user.id, lastReadSeq: result.lastReadSeq });
    })
  );

  /** Reconnect catch-up: the messages after the newest one the client has, so nothing sent while
   * it was offline is lost - plus anything edited, removed or reacted to since the client's last
   * sync - or `reset` when so much arrived that it should reload instead. */
  socket.on(
    "sync",
    safely("sync", async (payload: unknown, ack?: Ack) => {
      const parsed = syncMessagesSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ error: "Invalid sync request" });
      const user = await gate("read", ack);
      if (!user) return;
      const { conversationId, lastSeq, since } = parsed.data;
      const allowed = await access.get(user, conversationId);
      if (!allowed.ok) return ack?.({ error: "Forbidden" });
      // A sync is also how a reconnecting tab gets back into the room.
      socket.join(conversationRoom(conversationId));
      const { messages, changed, reset } = await listMessagesAfter(conversationId, lastSeq, {
        moderator: isStaff(user),
        since: since ? new Date(since) : null,
      });
      ack?.({ messages, changed, reset, lastSeq: Math.max(lastSeq, messages.at(-1)?.seq ?? 0), lastReadSeq: allowed.lastReadSeq });
    })
  );

  socket.on(
    "message:edit",
    safely("message:edit", async (payload: unknown, ack?: Ack) => {
      const parsed = editMessageSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ error: parsed.error.issues[0].message });
      const user = await gate("edit", ack);
      if (!user) return;
      const result = await editChatMessage({ messageId: parsed.data.messageId, userId: user.id, content: parsed.data.content });
      if ("error" in result) return ack?.({ error: result.error });
      io.to(conversationRoom(result.conversationId)).emit("message:updated", result.message);
      if (result.isLatest) await pushPreview(result.conversationId);
      ack?.({ message: result.message });
    })
  );

  /** The sender removes their own message, or a moderator of the conversation removes anyone's. */
  socket.on(
    "message:delete",
    safely("message:delete", async (payload: unknown, ack?: Ack) => {
      const parsed = messageIdSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ error: "Invalid message" });
      const user = await gate("edit", ack);
      if (!user) return;
      const target = await prisma.message.findUnique({ where: { id: parsed.data.messageId }, select: { conversationId: true, senderId: true } });
      if (!target) return ack?.({ error: "Not found" });
      const allowed = await access.get(user, target.conversationId);
      if (!allowed.ok) return ack?.({ error: "Forbidden" });
      const moderator = target.senderId !== user.id && allowed.canModerate;
      const result = await removeChatMessage({ messageId: parsed.data.messageId, userId: user.id, moderator });
      if ("error" in result) return ack?.({ error: result.error });
      io.to(conversationRoom(result.conversationId)).emit("message:updated", result.message);
      if (result.isLatest) await pushPreview(result.conversationId);
      ack?.({ message: result.message });
    })
  );

  socket.on(
    "message:react",
    safely("message:react", async (payload: unknown, ack?: Ack) => {
      const parsed = reactMessageSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ error: "Invalid reaction" });
      const user = await gate("reaction", ack);
      if (!user) return;
      const target = await prisma.message.findUnique({ where: { id: parsed.data.messageId }, select: { conversationId: true } });
      if (!target) return ack?.({ error: "Not found" });
      const allowed = await access.get(user, target.conversationId);
      if (!allowed.ok || !allowed.canPost) return ack?.({ error: "Forbidden" });
      const result = await toggleReaction({ messageId: parsed.data.messageId, userId: user.id, emoji: parsed.data.emoji });
      if ("error" in result) return ack?.({ error: result.error });
      io.to(conversationRoom(result.conversationId)).emit("message:updated", result.message);
      ack?.({ message: result.message });
    })
  );

  // Typing indicators are relayed only into rooms this socket actually joined (conversation:join
  // checked access) - otherwise anyone could push their name into any conversation by id - and
  // at most every TYPING_THROTTLE_MS per conversation.
  const joinedRoom = (conversationId: unknown) =>
    isId(conversationId) && socket.rooms.has(conversationRoom(conversationId)) ? conversationRoom(conversationId) : null;

  socket.on("typing:start", (conversationId: unknown) => {
    const room = joinedRoom(conversationId);
    if (!room) return;
    const now = Date.now();
    if (now - (socket.data.typingAt[conversationId as string] ?? 0) < TYPING_THROTTLE_MS) return;
    socket.data.typingAt[conversationId as string] = now;
    const { id: userId, name } = socket.data.user;
    socket.to(room).emit("typing:start", { conversationId, userId, name });
  });

  socket.on("typing:stop", (conversationId: unknown) => {
    const room = joinedRoom(conversationId);
    if (!room) return;
    delete socket.data.typingAt[conversationId as string];
    socket.to(room).emit("typing:stop", { conversationId, userId: socket.data.user.id });
  });

  /** Online state for people the caller shares a conversation with; anyone else is reported offline. */
  socket.on(
    "presence:query",
    safely("presence:query", async (userIds: unknown, ack?: Ack) => {
      if (typeof ack !== "function") return;
      const user = await gate("read", ack);
      if (!user) return;
      const candidates = Array.isArray(userIds) ? [...new Set(userIds.filter(isId))].slice(0, MAX_PRESENCE_QUERY) : [];
      const visible = isStaff(user) ? candidates : await contactIdsAmong(user.id, candidates);
      const online = await presence.onlineAmong(visible);
      ack({ online: [...online] });
    })
  );
}
