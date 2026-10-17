// Per-user token buckets. In Redis, so a user's limit holds across tabs and gateway nodes; an
// in-memory twin covers single-process local development without Redis.
import type IORedis from "ioredis";

export type BucketSpec = {
  /** Burst size. */
  capacity: number;
  /** Tokens added back per second. */
  refillPerSecond: number;
};

export const CHAT_BUCKETS = {
  /** 20 in a burst, then one a second (60 a minute sustained). */
  message: { capacity: 20, refillPerSecond: 1 },
  edit: { capacity: 10, refillPerSecond: 0.2 },
  reaction: { capacity: 30, refillPerSecond: 2 },
  /** Joins, syncs and presence lookups - generous, but stops a client stuck in a loop. */
  read: { capacity: 120, refillPerSecond: 10 },
} satisfies Record<string, BucketSpec>;

export type BucketName = keyof typeof CHAT_BUCKETS;

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

export interface RateLimiter {
  take(bucket: BucketName, userId: string, cost?: number): Promise<RateLimitResult>;
}

// KEYS[1] bucket key; ARGV: capacity, refill per ms, now (ms), cost. Returns {allowed, retryAfterMs}.
const TOKEN_BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end
tokens = math.min(capacity, tokens + math.max(0, now - ts) * refill)
local allowed = 0
local retry = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry = math.ceil((cost - tokens) / refill)
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / refill) + 1000)
return {allowed, retry}
`;

type RedisWithBucket = IORedis & {
  nubTokenBucket(key: string, capacity: number, refillPerMs: number, now: number, cost: number): Promise<[number, number]>;
};

export function createRedisRateLimiter(redis: IORedis): RateLimiter {
  const client = redis as RedisWithBucket;
  if (typeof client.nubTokenBucket !== "function") {
    // defineCommand sends EVALSHA and falls back to EVAL once if Redis doesn't have the script yet.
    redis.defineCommand("nubTokenBucket", { numberOfKeys: 1, lua: TOKEN_BUCKET_LUA });
  }
  return {
    async take(bucket, userId, cost = 1) {
      const spec = CHAT_BUCKETS[bucket];
      const [allowed, retryAfterMs] = await client.nubTokenBucket(
        `rl:${bucket}:${userId}`,
        spec.capacity,
        spec.refillPerSecond / 1000,
        Date.now(),
        cost
      );
      return { allowed: allowed === 1, retryAfterMs: Number(retryAfterMs) };
    },
  };
}

export function createMemoryRateLimiter(): RateLimiter {
  const buckets = new Map<string, { tokens: number; ts: number }>();
  return {
    async take(bucket, userId, cost = 1) {
      const spec = CHAT_BUCKETS[bucket];
      const refillPerMs = spec.refillPerSecond / 1000;
      const key = `${bucket}:${userId}`;
      const now = Date.now();
      const state = buckets.get(key) ?? { tokens: spec.capacity, ts: now };
      const tokens = Math.min(spec.capacity, state.tokens + Math.max(0, now - state.ts) * refillPerMs);
      if (tokens >= cost) {
        buckets.set(key, { tokens: tokens - cost, ts: now });
        return { allowed: true, retryAfterMs: 0 };
      }
      buckets.set(key, { tokens, ts: now });
      return { allowed: false, retryAfterMs: Math.ceil((cost - tokens) / refillPerMs) };
    },
  };
}
