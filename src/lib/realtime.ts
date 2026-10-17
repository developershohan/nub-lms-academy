import "server-only";
import Redis from "ioredis";
import { Emitter } from "@socket.io/redis-emitter";

const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL ?? "http://localhost:3001";
const SOCKET_INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET;
const REDIS_URL = process.env.REDIS_URL;

const globalForRealtime = globalThis as unknown as { realtimeEmitter?: Emitter };

/**
 * With REDIS_URL set, events go straight onto Redis and every socket server node picks them up
 * through its Redis adapter (socket-server/redis.ts) - no HTTP hop, and it works with any number
 * of nodes. One client per server process, kept on globalThis so dev hot reloads don't leak them.
 */
function getEmitter() {
  if (!REDIS_URL) return null;
  if (!globalForRealtime.realtimeEmitter) {
    const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 2 });
    client.on("error", (err) => console.error("Realtime Redis error:", err.message));
    // The emitter only ever calls publish. A failed publish is swallowed: a missed live update must
    // never fail the mutation that caused it - clients catch up on their next sync or page load.
    const publisher = {
      publish: (channel: string, message: string | Buffer) => client.publish(channel, message).catch(() => 0),
    };
    globalForRealtime.realtimeEmitter = new Emitter(publisher);
  }
  return globalForRealtime.realtimeEmitter;
}

/** Without Redis: the single socket server's guarded HTTP bridge (socket-server/index.ts). */
function postToSocketServer(path: string, body: unknown) {
  if (!SOCKET_INTERNAL_SECRET) return;
  fetch(`${SOCKET_SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": SOCKET_INTERNAL_SECRET },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** Fire-and-forget push to already-open tabs, so they update live instead of on a manual refresh.
 * The triggering mutation (approval, payment, message...) must succeed even if realtime is down
 * or unconfigured, so this never throws. */
export function emitRealtime(room: string, event: string, payload?: unknown) {
  const emitter = getEmitter();
  if (emitter) {
    emitter.to(room).emit(event, payload);
    return;
  }
  postToSocketServer("/internal/emit", { room, event, payload });
}

/** Drops every live socket of a user (ban, password change/reset). Their reconnect then fails:
 * the socket server re-checks the account and the session that would mint a new socket token is
 * gone. Fire-and-forget, like emitRealtime. */
export function disconnectUserSockets(userId: string) {
  const emitter = getEmitter();
  if (emitter) {
    emitter.in(`user:${userId}`).disconnectSockets(true);
    return;
  }
  postToSocketServer("/internal/disconnect", { userId });
}
