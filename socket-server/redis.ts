import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";

/**
 * The Socket.IO Redis adapter: every node subscribes to Redis, so an emit on any node - or from
 * Next.js through @socket.io/redis-emitter (src/lib/realtime.ts) - reaches a user wherever their
 * socket is connected. Both sides use the default "socket.io" channel prefix.
 *
 * Connection state recovery isn't used: the classic Redis adapter doesn't support it. Short drops
 * are covered by the chat's own catch-up instead - on reconnect a client sends the last message
 * seq it has per conversation and gets only the gap (see events/chat.events.ts, "sync").
 */
export function createRedisAdapter(url: string, createClient: (url: string) => Redis = (u) => new Redis(u)) {
  const pubClient = createClient(url);
  const subClient = pubClient.duplicate();
  for (const [name, client] of [["pub", pubClient], ["sub", subClient]] as const) {
    // Without a listener ioredis logs every reconnect attempt as an unhandled error event.
    client.on("error", (err: Error) => console.error(`Redis ${name} client error:`, err.message));
  }
  return { adapter: createAdapter(pubClient, subClient), pubClient, subClient };
}
