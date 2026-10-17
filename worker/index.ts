// Background worker (BullMQ): notification email and web push, the delayed chat push and the
// 30-minute chat digest, and the course-channel membership sweep.
// Run with `npm run start:worker` (production, compiled) or `npm run dev:worker`.
import "dotenv/config";
import Redis from "ioredis";
import { Worker, type Job } from "bullmq";
import { Emitter } from "@socket.io/redis-emitter";
import { prisma } from "@/lib/prisma";
import type { RealtimeBus } from "@/server/realtime/bus";
import { createRedisPresence } from "@/server/realtime/presence";
import { QUEUE_NAMES, closeQueues, getQueue } from "@/server/realtime/queues";
import { closeSharedRedis, createRedis, getRedisUrl, getSharedRedis } from "@/server/realtime/redis";
import type { DeliveryJob } from "@/server/notifications/notify";
import {
  deliverEmail,
  deliverPush,
  processChatDigestScan,
  processChatPushScan,
  processMembershipSweep,
  type JobDeps,
} from "@/server/notifications/jobs";

if (!getRedisUrl()) {
  console.error("REDIS_URL is not set - the worker has nothing to read jobs from.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Missing required environment variable(s): DATABASE_URL");
  process.exit(1);
}

/** The worker reaches browsers the same way the web app does: through the Redis emitter. */
function emitterBus(): RealtimeBus {
  const client = new Redis(getRedisUrl()!, { maxRetriesPerRequest: 2 });
  client.on("error", (err) => console.error("Worker emitter error:", err.message));
  const emitter = new Emitter({ publish: (channel: string, message: string | Buffer) => client.publish(channel, message).catch(() => 0) });
  return {
    emit: (room, event, payload) => emitter.to(room).emit(event, payload),
    disconnectUser: (userId) => emitter.in(`user:${userId}`).disconnectSockets(true),
    removeUserFromRoom: (userId, room) => emitter.in(`user:${userId}`).socketsLeave(room),
    invalidateUser: (userId) => emitter.serverSideEmit("chat:invalidate", userId),
  };
}

const deps: JobDeps = { bus: emitterBus(), presence: createRedisPresence(getSharedRedis()!) };
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

function start<T>(queue: string, handler: (job: Job<T>) => Promise<unknown>) {
  const worker = new Worker<T>(queue, handler, { connection: createRedis(`worker-${queue}`), concurrency });
  worker.on("failed", (job, err) => console.error(`Job ${queue}/${job?.name} failed (attempt ${job?.attemptsMade}):`, err.message));
  worker.on("error", (err) => console.error(`Worker ${queue}: ${err.message}`));
  return worker;
}

const workers = [
  start<DeliveryJob>(QUEUE_NAMES.delivery, async (job) => {
    if (job.name === "email") return deliverEmail(job.data);
    if (job.name === "push") return deliverPush(job.data);
  }),
  start(QUEUE_NAMES.chat, async (job) => {
    if (job.name === "push-scan") return processChatPushScan(deps);
    if (job.name === "digest-scan") return processChatDigestScan();
  }),
  start(QUEUE_NAMES.maintenance, async (job) => {
    if (job.name === "reconcile-memberships") return processMembershipSweep(deps);
  }),
];

/** Repeating jobs. upsertJobScheduler is idempotent, so every worker can (re)declare them. */
async function schedule() {
  const chat = getQueue(QUEUE_NAMES.chat)!;
  await chat.upsertJobScheduler("chat-push-scan", { every: 20_000 }, { name: "push-scan", data: {} });
  await chat.upsertJobScheduler("chat-digest-scan", { every: 5 * 60_000 }, { name: "digest-scan", data: {} });
  await getQueue(QUEUE_NAMES.maintenance)!.upsertJobScheduler("membership-sweep", { every: 15 * 60_000 }, { name: "reconcile-memberships", data: {} });
}

schedule()
  .then(() => console.log(`Worker running (${workers.length} queues, concurrency ${concurrency}).`))
  .catch((err) => console.error("Could not register repeating jobs:", err instanceof Error ? err.message : err));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received - finishing current jobs.`);
  const force = setTimeout(() => process.exit(0), 20_000);
  force.unref();
  try {
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all([closeQueues(), closeSharedRedis(), prisma.$disconnect()]);
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
