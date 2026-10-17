import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { closeQueues } from "@/server/realtime/queues";
import { closeSharedRedis } from "@/server/realtime/redis";
import { createGateway } from "./gateway";

const REQUIRED_IN_PRODUCTION = ["AUTH_SECRET", "DATABASE_URL", "SOCKET_CORS_ORIGIN", "REDIS_URL"] as const;

if (process.env.NODE_ENV === "production") {
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    // Variable names only, never values - failing fast here beats a confusing 401/CORS failure
    // downstream that looks like a client bug but is actually a missing server config value.
    console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
    process.exit(1);
  }
}

// Railway/Render assign the port via PORT at runtime and expect the app to bind to it - SOCKET_PORT
// is only a fallback for local dev where you're choosing the port yourself.
const PORT = Number(process.env.PORT ?? process.env.SOCKET_PORT ?? 3001);
// Comma-separated allow-list, trailing slashes stripped - never falls back to "*", since that's
// incompatible with credentialed (cookie/auth) requests.
const CORS_ORIGINS = (process.env.SOCKET_CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
// Redis joins the nodes up (adapter), lets Next.js publish straight to them (emitter), and holds
// presence, rate limits and the job queue. Without it this is a single node with the /internal/*
// HTTP bridge and in-memory presence and limits. Locally: `docker compose up -d redis`.
const REDIS_URL = process.env.REDIS_URL ?? null;
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET;

const gateway = createGateway({ corsOrigins: CORS_ORIGINS, redisUrl: REDIS_URL, internalSecret: INTERNAL_SECRET });

gateway.listen(PORT).then((port) => {
  console.log(`Socket.IO chat server listening on :${port} (CORS origins: ${CORS_ORIGINS.join(", ")}; adapter: ${REDIS_URL ? "redis" : "memory"})`);
  if (!REDIS_URL) {
    console.warn("REDIS_URL is not set - running as a single node with in-memory presence and rate limits; the Redis emitter is off.");
    if (!INTERNAL_SECRET) console.warn("SOCKET_INTERNAL_SECRET is not set - /internal/* will reject every request until it is.");
  }
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received - closing connections (clients reconnect and re-sync).`);
  const force = setTimeout(() => process.exit(0), 10_000);
  force.unref();
  try {
    await gateway.close();
    await Promise.all([closeQueues(), closeSharedRedis(), prisma.$disconnect()]);
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
