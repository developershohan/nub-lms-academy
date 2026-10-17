import type { Server, Socket } from "socket.io";
import { sendMessageSchema } from "@/lib/validations/chat";
import { canAccessConversation, persistMessage, markConversationRead } from "../chat-store";

const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 10_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

/** Basic in-memory per-connection rate limit for message sending, since Redis isn't configured
 * for this MVP - resets naturally when the socket disconnects (see index.ts). */
function isRateLimited(socketId: string) {
  const now = Date.now();
  const bucket = rateBuckets.get(socketId);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(socketId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

export function clearRateLimit(socketId: string) {
  rateBuckets.delete(socketId);
}

type Ack = (res: { error?: string }) => void;

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

/** Presence is scoped to conversations: a user's online/offline status only goes to people in a
 * conversation room with them, never to every connected socket on the platform. */
async function userIdsInRoom(io: Server, room: string, excludeSocketId?: string) {
  const sockets = await io.in(room).fetchSockets();
  return new Set(sockets.filter((s) => s.id !== excludeSocketId).map((s) => s.data.user?.id as string));
}

/** Announces userId as offline in a room unless another of their tabs is still in it. */
async function announceOfflineIfGone(io: Server, room: string, userId: string, leavingSocketId: string) {
  const stillThere = await userIdsInRoom(io, room, leavingSocketId);
  if (!stillThere.has(userId)) io.to(room).emit("user:offline", { userId });
}

export function registerChatEvents(io: Server, socket: Socket) {
  const { id: userId, roleNames, name } = socket.data.user;

  socket.on(
    "conversation:join",
    safely("conversation:join", async (conversationId: unknown, ack?: Ack) => {
      if (typeof conversationId !== "string") return ack?.({ error: "Invalid conversation" });
      const allowed = await canAccessConversation(roleNames, userId, conversationId);
      if (!allowed) return ack?.({ error: "Forbidden" });

      const room = conversationRoom(conversationId);
      socket.join(room);
      socket.to(room).emit("user:online", { userId });
      for (const otherId of await userIdsInRoom(io, room)) {
        if (otherId !== userId) socket.emit("user:online", { userId: otherId });
      }
      ack?.({});
    })
  );

  socket.on(
    "conversation:leave",
    safely("conversation:leave", async (conversationId: unknown) => {
      if (typeof conversationId !== "string") return;
      const room = conversationRoom(conversationId);
      if (!socket.rooms.has(room)) return;
      socket.leave(room);
      await announceOfflineIfGone(io, room, userId, socket.id);
    })
  );

  // "disconnecting" (not "disconnect") still has socket.rooms populated.
  socket.on(
    "disconnecting",
    safely("disconnecting", async () => {
      const rooms = [...socket.rooms].filter((room) => room.startsWith("conversation:"));
      await Promise.all(rooms.map((room) => announceOfflineIfGone(io, room, userId, socket.id)));
    })
  );

  socket.on(
    "message:send",
    safely("message:send", async (payload: unknown, ack?: Ack) => {
      if (isRateLimited(socket.id)) return ack?.({ error: "You're sending messages too fast" });

      const parsed = sendMessageSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ error: parsed.error.issues[0].message });

      const { conversationId, content } = parsed.data;
      const allowed = await canAccessConversation(roleNames, userId, conversationId);
      if (!allowed) return ack?.({ error: "Forbidden" });

      const { message, recipientIds } = await persistMessage(conversationId, userId, content);
      io.to(conversationRoom(conversationId)).emit("message:new", message);
      for (const recipientId of recipientIds) {
        io.to(`user:${recipientId}`).emit("notification:new");
      }
      ack?.({});
    })
  );

  socket.on(
    "message:read",
    safely("message:read", async (conversationId: unknown) => {
      if (typeof conversationId !== "string") return;
      const allowed = await canAccessConversation(roleNames, userId, conversationId);
      if (!allowed) return;

      await markConversationRead(conversationId, userId);
      socket.to(conversationRoom(conversationId)).emit("message:read", { conversationId, userId });
    })
  );

  // Typing indicators are relayed only into rooms this socket actually joined (conversation:join
  // checked access) - otherwise anyone could push their name into any conversation by id.
  const joinedRoom = (conversationId: unknown) =>
    typeof conversationId === "string" && socket.rooms.has(conversationRoom(conversationId))
      ? conversationRoom(conversationId)
      : null;

  socket.on("typing:start", (conversationId: unknown) => {
    const room = joinedRoom(conversationId);
    if (room) socket.to(room).emit("typing:start", { conversationId, userId, name });
  });

  socket.on("typing:stop", (conversationId: unknown) => {
    const room = joinedRoom(conversationId);
    if (room) socket.to(room).emit("typing:stop", { conversationId, userId });
  });
}
