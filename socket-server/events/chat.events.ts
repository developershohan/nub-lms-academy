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

export function registerChatEvents(io: Server, socket: Socket) {
  const { id: userId, roleNames, name } = socket.data.user;

  socket.on("conversation:join", async (conversationId: unknown, ack?: (res: { error?: string }) => void) => {
    if (typeof conversationId !== "string") return ack?.({ error: "Invalid conversation" });
    const allowed = await canAccessConversation(roleNames, userId, conversationId);
    if (!allowed) return ack?.({ error: "Forbidden" });

    socket.join(conversationRoom(conversationId));
    ack?.({});
  });

  socket.on("conversation:leave", (conversationId: unknown) => {
    if (typeof conversationId === "string") socket.leave(conversationRoom(conversationId));
  });

  socket.on(
    "message:send",
    async (payload: unknown, ack?: (res: { error?: string }) => void) => {
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
    }
  );

  socket.on("message:read", async (conversationId: unknown) => {
    if (typeof conversationId !== "string") return;
    const allowed = await canAccessConversation(roleNames, userId, conversationId);
    if (!allowed) return;

    await markConversationRead(conversationId, userId);
    socket.to(conversationRoom(conversationId)).emit("message:read", { conversationId, userId });
  });

  socket.on("typing:start", (conversationId: unknown) => {
    if (typeof conversationId === "string") {
      socket.to(conversationRoom(conversationId)).emit("typing:start", { conversationId, userId, name });
    }
  });

  socket.on("typing:stop", (conversationId: unknown) => {
    if (typeof conversationId === "string") {
      socket.to(conversationRoom(conversationId)).emit("typing:stop", { conversationId, userId });
    }
  });
}
