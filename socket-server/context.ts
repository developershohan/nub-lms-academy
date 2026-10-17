// Per-node state for the socket server: short-lived caches of who a socket's user is and what
// they may access, so the hot path (message:send, sync) doesn't re-run every permission query.
import type { Server, Socket } from "socket.io";
import type { Queue } from "bullmq";
import { rooms } from "@/server/realtime/bus";
import { getChatUser, isStaff, resolveAccess, type ChatUser, type ConversationAccess } from "@/server/chat/access";
import type { PresenceStore } from "@/server/realtime/presence";
import type { RateLimiter } from "@/server/realtime/rate-limit";

export type SocketData = {
  user: ChatUser;
  /** The conversation this tab has on screen, if any. */
  viewing: string | null;
  /** What the tab last said it has on screen, joined or not yet: a "viewing" that overtakes its
   * own conversation:join (the join awaits an access check) takes effect once the join lands. */
  viewingRequested?: string | null;
  /** Last time a typing:start was relayed, per conversation - typing is throttled. */
  typingAt: Record<string, number>;
};

export type GatewaySocket = Socket & { data: SocketData };

/** How long a permission answer or a user's status/roles are trusted before re-reading the database. */
export const CACHE_TTL_MS = 30_000;
const DENIED_TTL_MS = 5_000;

export class AccessCache {
  private readonly byUser = new Map<string, Map<string, { value: ConversationAccess; expires: number }>>();

  async get(user: ChatUser, conversationId: string): Promise<ConversationAccess> {
    const now = Date.now();
    const entry = this.byUser.get(user.id)?.get(conversationId);
    if (entry && entry.expires > now) return entry.value;
    const value = await resolveAccess(user, conversationId);
    let forUser = this.byUser.get(user.id);
    if (!forUser) {
      forUser = new Map();
      this.byUser.set(user.id, forUser);
    }
    forUser.set(conversationId, { value, expires: now + (value.ok ? CACHE_TTL_MS : DENIED_TTL_MS) });
    return value;
  }

  /** "*" drops everything (a channel setting that affects every member changed). */
  invalidate(userId: string) {
    if (userId === "*") this.byUser.clear();
    else this.byUser.delete(userId);
  }

  sweep() {
    const now = Date.now();
    for (const [userId, entries] of this.byUser) {
      for (const [conversationId, entry] of entries) if (entry.expires <= now) entries.delete(conversationId);
      if (entries.size === 0) this.byUser.delete(userId);
    }
  }
}

/**
 * The socket's user, re-read from the database at most every CACHE_TTL_MS. A user who has been
 * banned (or deleted) since connecting gets disconnected here even if the explicit disconnect
 * from the ban was missed; a role change takes effect (staff room) without a reconnect.
 */
export class UserCache {
  private readonly checkedAt = new Map<string, number>();

  async fresh(socket: GatewaySocket): Promise<ChatUser | null> {
    const current = socket.data.user;
    const now = Date.now();
    if (now - (this.checkedAt.get(current.id) ?? 0) < CACHE_TTL_MS) return current;
    const user = await getChatUser(current.id);
    if (!user) {
      socket.disconnect(true);
      return null;
    }
    this.checkedAt.set(user.id, now);
    socket.data.user = user;
    if (isStaff(user)) socket.join(rooms.staff);
    else socket.leave(rooms.staff);
    return user;
  }

  /** The first check after connecting is the auth middleware's own lookup. */
  markChecked(userId: string) {
    this.checkedAt.set(userId, Date.now());
  }

  invalidate(userId: string) {
    if (userId === "*") this.checkedAt.clear();
    else this.checkedAt.delete(userId);
  }
}

export type GatewayContext = {
  io: Server;
  presence: PresenceStore;
  limiter: RateLimiter;
  access: AccessCache;
  users: UserCache;
  queue: Queue | null;
  /** Drops this node's caches for a user and tells the other nodes to do the same. */
  invalidate: (userId: string) => void;
};
