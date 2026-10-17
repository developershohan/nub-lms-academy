// Who is online, and who has which conversation on screen. Redis TTL keys, refreshed by each
// gateway node's heartbeat, so a node that crashes simply lets its users' keys expire.
import type IORedis from "ioredis";

export const PRESENCE_TTL_SECONDS = 60;

const onlineKey = (userId: string) => `presence:${userId}`;
const viewingKey = (conversationId: string, userId: string) => `viewing:${conversationId}:${userId}`;

export interface PresenceStore {
  /** (Re)marks users online for PRESENCE_TTL_SECONDS. */
  touchOnline(userIds: string[]): Promise<void>;
  markOffline(userId: string): Promise<void>;
  onlineAmong(userIds: string[]): Promise<Set<string>>;
  touchViewing(pairs: { userId: string; conversationId: string }[]): Promise<void>;
  stopViewing(userId: string, conversationId: string): Promise<void>;
  /** For each pair: does that user have that conversation open in a visible tab right now? */
  viewing(pairs: { userId: string; conversationId: string }[]): Promise<boolean[]>;
}

export function createRedisPresence(redis: IORedis): PresenceStore {
  return {
    async touchOnline(userIds) {
      if (userIds.length === 0) return;
      const pipeline = redis.pipeline();
      for (const id of userIds) pipeline.set(onlineKey(id), "1", "EX", PRESENCE_TTL_SECONDS);
      await pipeline.exec();
    },
    async markOffline(userId) {
      await redis.del(onlineKey(userId));
    },
    async onlineAmong(userIds) {
      if (userIds.length === 0) return new Set();
      const values = await redis.mget(userIds.map(onlineKey));
      return new Set(userIds.filter((_, i) => values[i] !== null));
    },
    async touchViewing(pairs) {
      if (pairs.length === 0) return;
      const pipeline = redis.pipeline();
      for (const p of pairs) pipeline.set(viewingKey(p.conversationId, p.userId), "1", "EX", PRESENCE_TTL_SECONDS);
      await pipeline.exec();
    },
    async stopViewing(userId, conversationId) {
      await redis.del(viewingKey(conversationId, userId));
    },
    async viewing(pairs) {
      if (pairs.length === 0) return [];
      const values = await redis.mget(pairs.map((p) => viewingKey(p.conversationId, p.userId)));
      return values.map((v) => v !== null);
    },
  };
}

/** Single-process stand-in for local development without Redis. */
export function createMemoryPresence(): PresenceStore {
  const expiries = new Map<string, number>();
  const alive = (key: string) => (expiries.get(key) ?? 0) > Date.now();
  const touch = (key: string) => expiries.set(key, Date.now() + PRESENCE_TTL_SECONDS * 1000);
  return {
    async touchOnline(userIds) {
      userIds.forEach((id) => touch(onlineKey(id)));
    },
    async markOffline(userId) {
      expiries.delete(onlineKey(userId));
    },
    async onlineAmong(userIds) {
      return new Set(userIds.filter((id) => alive(onlineKey(id))));
    },
    async touchViewing(pairs) {
      pairs.forEach((p) => touch(viewingKey(p.conversationId, p.userId)));
    },
    async stopViewing(userId, conversationId) {
      expiries.delete(viewingKey(conversationId, userId));
    },
    async viewing(pairs) {
      return pairs.map((p) => alive(viewingKey(p.conversationId, p.userId)));
    },
  };
}
