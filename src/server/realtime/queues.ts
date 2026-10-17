// BullMQ queues shared by their producers (web app, socket server) and the worker (worker/index.ts).
// Without REDIS_URL there are no queues: producers fall back to doing the work inline.
import { Queue, type JobsOptions } from "bullmq";
import type { DeliveryJob } from "@/server/notifications/notify";
import { getSharedRedis } from "./redis";

export const QUEUE_NAMES = {
  /** One-off email and web push deliveries for a notification. */
  delivery: "delivery",
  /** Chat follow-ups: the delayed push scan and the email digest scan. */
  chat: "chat",
  /** Periodic housekeeping, e.g. dropping course-channel members whose access ended. */
  maintenance: "maintenance",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  // Keep Redis small: finished jobs are only interesting for a short while.
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const globalForQueues = globalThis as unknown as { nubQueues?: Map<string, Queue> };

export function getQueue(name: QueueName): Queue | null {
  const redis = getSharedRedis();
  if (!redis) return null;
  globalForQueues.nubQueues ??= new Map();
  let queue = globalForQueues.nubQueues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: redis, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queue.on("error", (err: Error) => console.error(`Queue ${name}: ${err.message}`));
    globalForQueues.nubQueues.set(name, queue);
  }
  return queue;
}

/** Hands an email or push to the worker. False when there is no queue, so the caller sends it itself. */
export async function enqueueDelivery(kind: "email" | "push", job: DeliveryJob): Promise<boolean> {
  const queue = getQueue(QUEUE_NAMES.delivery);
  if (!queue) return false;
  try {
    await queue.add(kind, job);
    return true;
  } catch (err) {
    console.error(`Could not queue ${kind} delivery:`, err instanceof Error ? err.message : "unknown error");
    return false;
  }
}

export async function closeQueues() {
  const queues = globalForQueues.nubQueues;
  globalForQueues.nubQueues = undefined;
  if (queues) await Promise.all([...queues.values()].map((q) => q.close().catch(() => {})));
}
