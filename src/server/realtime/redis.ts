// Redis connections for the web app, the socket gateway and the worker. No Next.js imports: this
// file is bundled into socket-server/ and worker/ as well.
import IORedis, { type RedisOptions } from "ioredis";

export function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url ? url : null;
}

const lastErrorLog = new Map<string, number>();

/** ioredis reconnects on its own and emits "error" on every failed attempt - log one line a minute
 * per connection instead of flooding the logs while Redis is down. */
function logConnectionError(name: string, err: Error) {
  const now = Date.now();
  if (now - (lastErrorLog.get(name) ?? 0) < 60_000) return;
  lastErrorLog.set(name, now);
  console.error(`Redis (${name}): ${err.message}`);
}

/**
 * A new connection. `maxRetriesPerRequest: null` is what BullMQ workers require, and it also means
 * a command issued while Redis is briefly unreachable waits for the reconnect instead of failing.
 * Callers that must not wait (the web app's emitter) pass their own options.
 */
export function createRedis(name: string, options: RedisOptions = {}): IORedis {
  const url = getRedisUrl();
  if (!url) throw new Error("REDIS_URL is not set");
  const client = new IORedis(url, {
    connectionName: `nub-${name}`,
    maxRetriesPerRequest: null,
    ...options,
  });
  client.on("error", (err) => logConnectionError(name, err));
  return client;
}

const globalForRedis = globalThis as unknown as { nubSharedRedis?: IORedis | null };

/**
 * One shared command connection per process (presence, rate limits, the emitter, queue producers),
 * or null when REDIS_URL isn't set. Kept on globalThis so Next.js dev reloads don't leak sockets.
 */
export function getSharedRedis(): IORedis | null {
  if (globalForRedis.nubSharedRedis !== undefined) return globalForRedis.nubSharedRedis;
  globalForRedis.nubSharedRedis = getRedisUrl()
    ? createRedis("shared", {
        // Fail fast instead of queueing forever: an emit or a rate-limit check must never hang a
        // request because Redis is down. Commands made while disconnected error after 3 retries.
        maxRetriesPerRequest: 3,
      })
    : null;
  return globalForRedis.nubSharedRedis;
}

/** Closes the shared connection (tests and graceful shutdown). */
export async function closeSharedRedis() {
  const client = globalForRedis.nubSharedRedis;
  globalForRedis.nubSharedRedis = undefined;
  if (client) await client.quit().catch(() => client.disconnect());
}
