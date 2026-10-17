import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { createRecoverableAdapter } from "./recoverable-adapter";

/**
 * The Socket.IO Redis adapter: every node subscribes to Redis, so an emit on any node - or from
 * Next.js through @socket.io/redis-emitter (src/lib/realtime.ts) - reaches a user wherever their
 * socket is connected. Both sides use the default "socket.io" channel prefix.
 *
 * With `recoverable`, the adapter also supports connectionStateRecovery (recoverable-adapter.ts):
 * a client that drops for a moment and comes back to the same node gets the events it missed
 * replayed. The stock adapter can't do that. Anything longer, or a reconnect to another node, is
 * covered by the chat's own catch-up - on reconnect a client sends the last message seq it has
 * per conversation and gets only the gap (see events/chat.events.ts, "sync").
 */
export function createRedisAdapter(
  url: string,
  createClient: (url: string) => Redis = (u) => new Redis(u, { maxRetriesPerRequest: null }),
  { recoverable = false } = {}
) {
  const pubClient = createClient(url);
  const subClient = pubClient.duplicate();
  for (const [name, client] of [["pub", pubClient], ["sub", subClient]] as const) {
    // Without a listener ioredis logs every reconnect attempt as an unhandled error event.
    client.on("error", (err: Error) => console.error(`Redis ${name} client error:`, err.message));
  }
  const adapter = recoverable ? createRecoverableAdapter(pubClient, subClient) : createAdapter(pubClient, subClient);
  return { adapter, pubClient, subClient };
}
